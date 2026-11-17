import { Router, type Request } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { nowInIndia, addDays } from "@shared/booking";
import { PRODUCTS, findProduct } from "@shared/catalog";
import { requireAdmin } from "../auth";
import { recordAudit } from "../audit";
import { BOOKING_STATUSES, canMoveBooking, countByStatus, fillDailySeries, percentChange } from "../admin-logic";
import { HttpError, escapeRegex, parseBody, rateLimit, requireDb, route } from "../http";
import { AuditLog, Booking, ORDER_STATUSES, Order, PAYMENT_STATUSES, Product, type OrderStatus } from "../mongodb";
import { cancelBooking, publicBooking } from "./bookings";
import { NEXT_STATUS, cancelOrder, findAccessibleOrder, publicOrder } from "./orders";

const IST = "Asia/Kolkata";
const LOW_STOCK = 5;

const BOOKING_PAYMENT_STATUSES = ["awaiting_payment", "verification_pending", "paid", "pay_at_salon", "failed", "refunded"] as const;

// ---------------------------------------------------------------- schemas

const note = z.string().trim().max(500).optional();

const orderUpdateSchema = z
  .object({ status: z.enum(ORDER_STATUSES).optional(), paymentStatus: z.enum(PAYMENT_STATUSES).optional(), note })
  .refine((v) => v.status || v.paymentStatus || v.note, "Nothing to update");

const bookingUpdateSchema = z
  .object({ status: z.enum(BOOKING_STATUSES).optional(), paymentStatus: z.enum(BOOKING_PAYMENT_STATUSES).optional(), note })
  .refine((v) => v.status || v.paymentStatus, "Nothing to update");

const stockUpdateSchema = z.union([
  z.object({ stock: z.number().int().min(0).max(100_000) }),
  z.object({ adjust: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, "adjust must not be 0") }),
]);

// ---------------------------------------------------------------- helpers

function paging(query: Request["query"], maxSize = 100) {
  const page = Math.max(1, Math.min(10_000, Number.parseInt(String(query.page ?? "1"), 10) || 1));
  const pageSize = Math.max(1, Math.min(maxSize, Number.parseInt(String(query.pageSize ?? "25"), 10) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function str(v: unknown, max = 100): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

/** Sum and count per IST calendar day for documents created since `since`. */
function dailyTotals(model: typeof Order | typeof Booking, match: Record<string, unknown>, amountField: string) {
  return (model as typeof Order).aggregate<{ _id: string; count: number; revenue: number }>([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: IST } },
        count: { $sum: 1 },
        revenue: { $sum: `$${amountField}` },
      },
    },
  ]);
}

async function sumSince(model: typeof Order | typeof Booking, match: Record<string, unknown>, amountField: string) {
  const [row] = await (model as typeof Order).aggregate<{ total: number; count: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${amountField}` }, count: { $sum: 1 } } },
  ]);
  return { total: Math.round(row?.total ?? 0), count: row?.count ?? 0 };
}

/** IST midnight `daysAgo` days before today, as a Date. */
function istDayStart(daysAgo: number): Date {
  return new Date(`${addDays(nowInIndia().date, -daysAgo)}T00:00:00+05:30`);
}

async function inventoryRows() {
  const docs = await Product.find({ sku: { $in: PRODUCTS.map((p) => p.id) } }, { sku: 1, stock: 1, updatedAt: 1 }).lean();
  const bySku = new Map(docs.map((d) => [d.sku, d]));
  return PRODUCTS.map((p) => {
    const doc = bySku.get(p.id);
    return {
      sku: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      price: p.price,
      mrp: p.mrp,
      tracked: Boolean(doc),
      stock: doc ? doc.stock ?? 0 : p.stock,
      updatedAt: doc?.updatedAt ?? null,
    };
  });
}

// ---------------------------------------------------------------- router

export function adminRouter(): Router {
  const r = Router();
  r.use("/admin", requireAdmin, requireDb);
  // Generous, but stops a stolen admin token from hammering writes.
  const writeLimit = rateLimit({ name: "admin-write", windowMs: 60_000, max: 120 });

  /** Lets the dashboard confirm staff access before loading anything else. */
  r.get("/admin/session", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ id: req.auth!.id, email: req.auth!.email, isAdmin: true });
  });

  // ------------------------------------------------------------ overview

  r.get(
    "/admin/stats",
    route(async (_req, res) => {
      const today = nowInIndia().date;
      const last30 = istDayStart(29);
      const prev30 = istDayStart(59);
      const last14 = istDayStart(13);

      // "Sales" = orders and bookings that are neither cancelled nor still waiting for payment.
      const liveOrder = { status: { $nin: ["pending_payment", "cancelled"] } };
      const liveBooking = { status: { $nin: ["pending_payment", "cancelled"] } };

      const [
        orderStatusRows,
        bookingStatusRows,
        ordersNow,
        ordersPrev,
        bookingsNow,
        bookingsPrev,
        orderDaily,
        bookingDaily,
        ordersToVerify,
        bookingsToVerify,
        todaysBookings,
        inventory,
      ] = await Promise.all([
        Order.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
        Booking.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
        sumSince(Order, { ...liveOrder, createdAt: { $gte: last30 } }, "pricing.total"),
        sumSince(Order, { ...liveOrder, createdAt: { $gte: prev30, $lt: last30 } }, "pricing.total"),
        sumSince(Booking, { ...liveBooking, createdAt: { $gte: last30 } }, "price"),
        sumSince(Booking, { ...liveBooking, createdAt: { $gte: prev30, $lt: last30 } }, "price"),
        dailyTotals(Order, { ...liveOrder, createdAt: { $gte: last14 } }, "pricing.total"),
        dailyTotals(Booking, { ...liveBooking, createdAt: { $gte: last14 } }, "price"),
        Order.countDocuments({ "payment.status": "verification_pending", status: { $ne: "cancelled" } }),
        Booking.countDocuments({ "payment.status": "verification_pending", status: { $ne: "cancelled" } }),
        Booking.find({ date: today, status: { $in: ["pending_payment", "confirmed", "completed"] } }).sort({ time: 1 }),
        inventoryRows(),
      ]);

      const salesNow = ordersNow.total + bookingsNow.total;
      const salesPrev = ordersPrev.total + bookingsPrev.total;
      const orderCount = ordersNow.count;

      res.set("Cache-Control", "no-store");
      res.json({
        generatedAt: new Date().toISOString(),
        today,
        sales: {
          last30: salesNow,
          prev30: salesPrev,
          change: percentChange(salesNow, salesPrev),
          products: ordersNow.total,
          services: bookingsNow.total,
        },
        orders: {
          last30: orderCount,
          change: percentChange(orderCount, ordersPrev.count),
          averageValue: orderCount ? Math.round(ordersNow.total / orderCount) : 0,
          byStatus: countByStatus(ORDER_STATUSES, orderStatusRows),
        },
        bookings: {
          last30: bookingsNow.count,
          change: percentChange(bookingsNow.count, bookingsPrev.count),
          byStatus: countByStatus(BOOKING_STATUSES, bookingStatusRows),
          today: todaysBookings.map(publicBooking),
        },
        toVerify: { orders: ordersToVerify, bookings: bookingsToVerify },
        lowStock: inventory.filter((p) => p.stock <= LOW_STOCK).sort((a, b) => a.stock - b.stock),
        daily: fillDailySeries(today, 14, orderDaily, bookingDaily),
      });
    }),
  );

  // ------------------------------------------------------------ orders

  r.get(
    "/admin/orders",
    route(async (req, res) => {
      const { page, pageSize, skip } = paging(req.query);
      const filter: Record<string, unknown> = {};
      const status = str(req.query.status);
      if (status && (ORDER_STATUSES as readonly string[]).includes(status)) filter.status = status;
      if (str(req.query.payment) === "verification_pending") filter["payment.status"] = "verification_pending";
      const q = str(req.query.q);
      if (q) {
        const rx = { $regex: escapeRegex(q), $options: "i" };
        filter.$or = [{ orderNumber: rx }, { email: rx }, { "shippingAddress.name": rx }, { "shippingAddress.phone": rx }, { "payment.transactionId": rx }];
      }
      const [items, total] = await Promise.all([
        Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize),
        Order.countDocuments(filter),
      ]);
      res.json({ items: items.map(publicOrder), total, page, pageSize });
    }),
  );

  r.patch(
    "/admin/orders/:id",
    writeLimit,
    route(async (req, res) => {
      const body = parseBody(orderUpdateSchema, req.body);
      const order = await findAccessibleOrder(req, req.params.id);
      const before = { status: order.status, paymentStatus: order.payment!.status };

      if (body.status && body.status !== order.status) {
        if (!NEXT_STATUS[order.status as OrderStatus].includes(body.status)) {
          throw new HttpError(409, `Can't move an order from ${order.status} to ${body.status}.`);
        }
      }
      if (body.status === "cancelled" && order.status !== "cancelled") {
        await cancelOrder(order, body.note || "Cancelled by store");
      } else {
        if (body.status) order.status = body.status;
        if (body.paymentStatus) {
          order.payment!.status = body.paymentStatus;
          if (body.paymentStatus === "paid") order.payment!.verifiedAt = new Date();
        }
        order.history.push({ status: order.status, note: body.note || `Updated by ${req.auth!.email ?? "staff"}`, at: new Date() });
        await order.save();
      }

      const after = { status: order.status, paymentStatus: order.payment!.status };
      await recordAudit(req, {
        action: "order.update",
        entity: "order",
        entityRef: order.orderNumber,
        summary: describeChange(before, after, body.note),
        changes: { before, after, note: body.note },
      });
      res.json(publicOrder(order));
    }),
  );

  // ------------------------------------------------------------ bookings

  r.get(
    "/admin/bookings",
    route(async (req, res) => {
      const { page, pageSize, skip } = paging(req.query);
      const filter: Record<string, unknown> = {};
      const status = str(req.query.status);
      if (status && (BOOKING_STATUSES as readonly string[]).includes(status)) filter.status = status;
      if (str(req.query.payment) === "verification_pending") filter["payment.status"] = "verification_pending";
      const date = str(req.query.date, 10);
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) filter.date = date;
      const q = str(req.query.q);
      if (q) {
        const rx = { $regex: escapeRegex(q), $options: "i" };
        filter.$or = [{ bookingNumber: rx }, { "customer.name": rx }, { "customer.email": rx }, { "customer.phone": rx }, { "payment.transactionId": rx }];
      }
      // Upcoming first when looking at a single day; most recent first otherwise.
      const sort: Record<string, 1 | -1> = date ? { time: 1 } : { date: -1, time: -1 };
      const [items, total] = await Promise.all([
        Booking.find(filter).sort(sort).skip(skip).limit(pageSize),
        Booking.countDocuments(filter),
      ]);
      res.json({ items: items.map(publicBooking), total, page, pageSize });
    }),
  );

  r.patch(
    "/admin/bookings/:id",
    writeLimit,
    route(async (req, res) => {
      const body = parseBody(bookingUpdateSchema, req.body);
      const filter = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { bookingNumber: req.params.id };
      const booking = await Booking.findOne(filter);
      if (!booking) throw new HttpError(404, "Booking not found.");
      const before = { status: booking.status, paymentStatus: booking.payment!.status };

      if (body.status && body.status !== booking.status && !canMoveBooking(booking.status, body.status)) {
        throw new HttpError(409, `Can't move a booking from ${booking.status} to ${body.status}.`);
      }
      if (body.paymentStatus) booking.payment!.status = body.paymentStatus;
      if (body.status === "cancelled" && booking.status !== "cancelled") {
        await cancelBooking(booking);
      } else {
        if (body.status) booking.status = body.status;
        await booking.save();
      }

      const after = { status: booking.status, paymentStatus: booking.payment!.status };
      await recordAudit(req, {
        action: "booking.update",
        entity: "booking",
        entityRef: booking.bookingNumber,
        summary: describeChange(before, after, body.note),
        changes: { before, after, note: body.note },
      });
      res.json(publicBooking(booking));
    }),
  );

  // ------------------------------------------------------------ inventory

  r.get(
    "/admin/inventory",
    route(async (_req, res) => {
      res.json({ items: await inventoryRows(), lowStockThreshold: LOW_STOCK });
    }),
  );

  r.patch(
    "/admin/inventory/:sku",
    writeLimit,
    route(async (req, res) => {
      const body = parseBody(stockUpdateSchema, req.body);
      const product = findProduct(req.params.sku);
      if (!product || product.id !== req.params.sku) throw new HttpError(404, "Product not found.");

      const existing = await Product.findOne({ sku: product.id });
      const before = existing ? existing.stock ?? 0 : product.stock;
      const next = "stock" in body ? body.stock : before + body.adjust;
      if (next < 0) throw new HttpError(409, `Only ${before} in stock; can't remove ${-("adjust" in body ? body.adjust : 0)}.`);

      // Start tracking the product in MongoDB the first time staff touch its stock.
      await Product.updateOne(
        { sku: product.id },
        {
          $set: { stock: next },
          $setOnInsert: {
            name: product.name,
            brand: product.brand,
            description: product.description,
            size: product.size,
            price: product.price,
            originalPrice: product.mrp,
            image: product.imagePath,
            category: product.category,
            rating: product.rating,
            reviews: product.reviews,
          },
        },
        { upsert: true },
      );

      await recordAudit(req, {
        action: "inventory.update",
        entity: "product",
        entityRef: product.id,
        summary: `Stock for ${product.name}: ${before} → ${next}`,
        changes: { before, after: next },
      });
      const row = (await inventoryRows()).find((p) => p.sku === product.id);
      res.json(row);
    }),
  );

  // ------------------------------------------------------------ audit log

  r.get(
    "/admin/audit",
    route(async (req, res) => {
      const { page, pageSize, skip } = paging(req.query);
      const filter: Record<string, unknown> = {};
      const entity = str(req.query.entity);
      if (entity && ["order", "booking", "product"].includes(entity)) filter.entity = entity;
      const ref = str(req.query.ref);
      if (ref) filter.entityRef = ref;
      const [items, total] = await Promise.all([
        AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        AuditLog.countDocuments(filter),
      ]);
      res.json({
        items: items.map((a) => ({
          id: a._id.toString(),
          actorEmail: a.actorEmail,
          action: a.action,
          entity: a.entity,
          entityRef: a.entityRef,
          summary: a.summary,
          createdAt: a.createdAt,
        })),
        total,
        page,
        pageSize,
      });
    }),
  );

  return r;
}

function describeChange(
  before: { status: string; paymentStatus: string },
  after: { status: string; paymentStatus: string },
  note?: string,
): string {
  const parts: string[] = [];
  if (before.status !== after.status) parts.push(`status ${before.status} → ${after.status}`);
  if (before.paymentStatus !== after.paymentStatus) parts.push(`payment ${before.paymentStatus} → ${after.paymentStatus}`);
  if (note) parts.push(`note: ${note}`);
  return parts.join("; ") || "No change";
}
