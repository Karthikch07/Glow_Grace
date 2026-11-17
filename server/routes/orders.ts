import { Router, type Request } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { addressSchema, emailSchema, PAYMENT_METHODS } from "@shared/checkout";
import { GIFT_MESSAGE_MAX, cartLineInputSchema, MAX_LINES } from "@shared/pricing";
import { optionalAuth, requireAuth } from "../auth";
import { env } from "../env";
import { HttpError, parseBody, rateLimit, requireDb, route } from "../http";
import { quoteWithLiveStock, releaseStock, reserveStock } from "../inventory";
import { Cart, Order, type OrderStatus } from "../mongodb";
import { deliveryFor } from "./cart";

type OrderDoc = InstanceType<typeof Order>;

// ---------------------------------------------------------------- schemas

const createOrderSchema = z.object({
  items: z.array(cartLineInputSchema).min(1, "Your bag is empty").max(MAX_LINES),
  couponCode: z.string().trim().max(30).optional().nullable(),
  giftWrap: z.boolean().default(false),
  giftMessage: z.string().max(GIFT_MESSAGE_MAX).default(""),
  email: emailSchema,
  address: addressSchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
  /** The total the customer saw. A mismatch means prices changed under them. */
  expectedTotal: z.number().nonnegative(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

const paymentSchema = z.object({
  transactionId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{6,35}$/, "Enter the 12-digit UPI reference (UTR) from your payment app"),
});

// ---------------------------------------------------------------- helpers

const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

function newOrderNumber(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = Array.from(crypto.randomBytes(5), (b) => alphabet[b % alphabet.length]).join("");
  return `GG${ymd}${rand}`;
}

function upiPaymentLink(order: OrderDoc): string | null {
  if (!env.upiId) return null;
  const params = new URLSearchParams({
    pa: env.upiId,
    pn: "GlowGrace",
    am: order.pricing!.total.toFixed(2),
    cu: "INR",
    tn: `Order ${order.orderNumber}`,
  });
  return `upi://pay?${params.toString()}`;
}

export function publicOrder(order: OrderDoc) {
  const o = order.toObject();
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    email: o.email,
    items: o.items,
    pricing: o.pricing,
    gift: o.gift,
    shippingAddress: o.shippingAddress,
    delivery: o.delivery,
    payment: {
      method: o.payment!.method,
      status: o.payment!.status,
      transactionId: o.payment!.transactionId,
      upiLink: o.status === "pending_payment" ? upiPaymentLink(order) : null,
    },
    status: o.status,
    history: o.history,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/** Finds an order the requester may see: its owner, a guest holding the access key, or an admin. */
export async function findAccessibleOrder(req: Request, idOrNumber: string): Promise<OrderDoc> {
  const filter = mongoose.isValidObjectId(idOrNumber) ? { _id: idOrNumber } : { orderNumber: idOrNumber };
  const order = await Order.findOne(filter);
  const key = req.header("x-order-key");
  const allowed =
    order &&
    ((req.auth && order.userId === req.auth.id) ||
      req.auth?.isAdmin ||
      (key && crypto.timingSafeEqual(Buffer.from(hashKey(key)), Buffer.from(order.accessKeyHash))));
  // 404 rather than 403 so order numbers can't be probed.
  if (!order || !allowed) throw new HttpError(404, "Order not found.");
  return order;
}

export async function cancelOrder(order: OrderDoc, note: string) {
  if (order.stockReserved) {
    await releaseStock(order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, name: i.name })));
    order.stockReserved = false;
  }
  order.status = "cancelled";
  if (order.payment!.status === "awaiting_payment" || order.payment!.status === "cod_pending") {
    order.payment!.status = "failed";
  }
  order.history.push({ status: "cancelled", note, at: new Date() });
  await order.save();
}

/** Allowed manual transitions for staff. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["placed", "cancelled"],
  placed: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

// ---------------------------------------------------------------- router

export function ordersRouter(): Router {
  const r = Router();

  r.post(
    "/orders",
    rateLimit({ name: "create-order", windowMs: 60_000, max: 10 }),
    optionalAuth,
    requireDb,
    route(async (req, res) => {
      const body = parseBody(createOrderSchema, req.body);

      if (body.idempotencyKey) {
        const existing = await Order.findOne({ idempotencyKey: body.idempotencyKey });
        if (existing) {
          if (existing.userId && existing.userId !== req.auth?.id) throw new HttpError(409, "Duplicate request.");
          // The access key is only returned once, at creation. A retried guest request gets the order without it.
          return res.status(200).json({ order: publicOrder(existing), accessKey: null, duplicate: true });
        }
      }

      const quote = await quoteWithLiveStock({
        items: body.items,
        couponCode: body.couponCode,
        giftWrap: body.giftWrap,
      });

      if (quote.lines.length === 0) throw new HttpError(400, "None of the items in your bag are available.");
      if (quote.issues.length > 0) {
        throw new HttpError(409, "Some items in your bag changed. Please review it before paying.", { quote });
      }
      if (body.couponCode && quote.coupon.status !== "applied") {
        const reason = "reason" in quote.coupon ? quote.coupon.reason : "This coupon can't be applied.";
        throw new HttpError(422, reason, { quote });
      }
      if (Math.round(body.expectedTotal) !== quote.total) {
        throw new HttpError(409, "Prices were updated since you opened your bag. Please confirm the new total.", { quote });
      }

      const delivery = deliveryFor(body.address.pincode);
      if (!delivery.serviceable) throw new HttpError(422, `We don't deliver to ${body.address.pincode} yet.`);
      if (body.paymentMethod === "cod" && !delivery.codAvailable) {
        throw new HttpError(422, `Cash on delivery isn't available for ${body.address.pincode}. Please pay by UPI.`);
      }

      const lines = quote.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, name: l.name }));
      const stockReserved = await reserveStock(lines);

      const accessKey = crypto.randomBytes(24).toString("base64url");
      const isCod = body.paymentMethod === "cod";
      let order: OrderDoc | undefined;
      try {
        for (let attempt = 0; !order && attempt < 3; attempt++) {
          try {
            order = await Order.create({
              orderNumber: newOrderNumber(),
              userId: req.auth?.id,
              email: body.email,
              accessKeyHash: hashKey(accessKey),
              idempotencyKey: body.idempotencyKey,
              items: quote.lines.map((l) => ({
                productId: l.productId,
                name: l.name,
                brand: l.brand,
                size: l.size,
                unitPrice: l.unitPrice,
                unitMrp: l.unitMrp,
                quantity: l.quantity,
                lineTotal: l.lineTotal,
              })),
              pricing: {
                mrpTotal: quote.mrpTotal,
                subtotal: quote.subtotal,
                mrpDiscount: quote.mrpDiscount,
                couponCode: quote.coupon.status === "applied" ? quote.coupon.code : null,
                couponDiscount: quote.couponDiscount,
                giftWrapFee: quote.giftWrapFee,
                shippingFee: quote.shippingFee,
                total: quote.total,
              },
              gift: { wrap: quote.giftWrap, message: quote.giftWrap ? body.giftMessage.trim() : "" },
              shippingAddress: body.address,
              delivery: { minDays: delivery.minDays, maxDays: delivery.maxDays, estimatedBy: new Date(delivery.latest) },
              payment: { method: body.paymentMethod, status: isCod ? "cod_pending" : "awaiting_payment" },
              status: isCod ? "placed" : "pending_payment",
              stockReserved,
              history: [{ status: isCod ? "placed" : "pending_payment", note: isCod ? "Cash on delivery" : "Awaiting UPI payment" }],
            });
          } catch (e: any) {
            // Retry only on an order-number collision.
            if (e?.code !== 11000 || !e?.keyPattern?.orderNumber) throw e;
          }
        }
        if (!order) throw new Error("Could not allocate an order number");
      } catch (e) {
        if (stockReserved) await releaseStock(lines);
        throw e;
      }

      if (req.auth) {
        const ordered = quote.lines.map((l) => l.productId);
        await Cart.updateOne(
          { userId: req.auth.id },
          { $pull: { items: { productId: { $in: ordered } } }, $set: { couponCode: null, giftWrap: false, giftMessage: "" } },
        );
      }

      res.status(201).json({ order: publicOrder(order), accessKey });
    }),
  );

  r.get(
    "/orders",
    requireAuth,
    requireDb,
    route(async (req, res) => {
      const orders = await Order.find({ userId: req.auth!.id }).sort({ createdAt: -1 }).limit(100);
      res.json(orders.map(publicOrder));
    }),
  );

  r.get(
    "/orders/:id",
    optionalAuth,
    requireDb,
    route(async (req, res) => {
      res.json(publicOrder(await findAccessibleOrder(req, req.params.id)));
    }),
  );

  /** Customer submits their UPI reference; staff verify it against the bank statement. */
  r.post(
    "/orders/:id/payment",
    rateLimit({ name: "order-payment", windowMs: 60_000, max: 10 }),
    optionalAuth,
    requireDb,
    route(async (req, res) => {
      const { transactionId } = parseBody(paymentSchema, req.body);
      const order = await findAccessibleOrder(req, req.params.id);
      if (order.payment!.method !== "upi") throw new HttpError(400, "This order is cash on delivery.");
      if (!["awaiting_payment", "verification_pending"].includes(order.payment!.status)) {
        throw new HttpError(409, "Payment for this order has already been processed.");
      }
      if (order.status === "cancelled") throw new HttpError(409, "This order was cancelled. Please place a new order.");

      order.payment!.transactionId = transactionId.toUpperCase();
      order.payment!.status = "verification_pending";
      order.payment!.submittedAt = new Date();
      if (order.status === "pending_payment") {
        order.status = "placed";
        order.history.push({ status: "placed", note: "UPI reference submitted", at: new Date() });
      }
      await order.save();
      res.json(publicOrder(order));
    }),
  );

  r.post(
    "/orders/:id/cancel",
    optionalAuth,
    requireDb,
    route(async (req, res) => {
      const order = await findAccessibleOrder(req, req.params.id);
      if (!["pending_payment", "placed"].includes(order.status)) {
        throw new HttpError(409, "This order can no longer be cancelled online. Please contact us.");
      }
      const paidOrPending = order.payment!.status === "verification_pending" || order.payment!.status === "paid";
      await cancelOrder(order, paidOrPending ? "Cancelled by customer; refund to be processed" : "Cancelled by customer");
      res.json(publicOrder(order));
    }),
  );

  // Staff endpoints for orders live in ./admin.ts.

  return r;
}

/** Releases stock held by UPI orders that were never paid. */
export function startUnpaidOrderSweeper(): NodeJS.Timeout {
  const sweep = async () => {
    if (mongoose.connection.readyState !== 1) return;
    const cutoff = new Date(Date.now() - env.unpaidOrderTtlMinutes * 60_000);
    const stale = await Order.find({
      status: "pending_payment",
      "payment.status": "awaiting_payment",
      createdAt: { $lt: cutoff },
    }).limit(100);
    for (const order of stale) {
      await cancelOrder(order, `Payment not received within ${env.unpaidOrderTtlMinutes} minutes`).catch((e) =>
        console.error(`[orders] failed to expire ${order.orderNumber}:`, e),
      );
    }
    if (stale.length) console.log(`[orders] expired ${stale.length} unpaid order(s)`);
  };
  const timer = setInterval(() => void sweep().catch((e) => console.error("[orders] sweep failed:", e)), 5 * 60_000);
  timer.unref();
  return timer;
}
