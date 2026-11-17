import { Router } from "express";
import { z } from "zod";
import { PRODUCTS, findProduct } from "@shared/catalog";
import {
  COUPONS,
  GIFT_MESSAGE_MAX,
  MAX_LINES,
  MAX_QTY_PER_ITEM,
  addBusinessDays,
  estimateDelivery,
  pincodeSchema,
  quoteInputSchema,
} from "@shared/pricing";
import { requireAuth } from "../auth";
import { parseBody, rateLimit, requireDb, route } from "../http";
import { quoteWithLiveStock } from "../inventory";
import { Cart } from "../mongodb";

export function deliveryFor(pincode: string, from = new Date()) {
  const est = estimateDelivery(pincode);
  return {
    ...est,
    earliest: addBusinessDays(from, est.minDays).toISOString(),
    latest: addBusinessDays(from, est.maxDays).toISOString(),
  };
}

const cartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(100),
        quantity: z.number().int().min(1).max(MAX_QTY_PER_ITEM),
      }),
    )
    .max(MAX_LINES),
  savedForLater: z.array(z.string().trim().min(1).max(100)).max(MAX_LINES).default([]),
  couponCode: z.string().trim().max(30).nullable().optional(),
  giftWrap: z.boolean().default(false),
  giftMessage: z.string().max(GIFT_MESSAGE_MAX).default(""),
});

type CartPayload = z.infer<typeof cartSchema>;

/** Drop unknown products and canonicalise ids (old carts used product names as ids). */
function normaliseCart(input: CartPayload): CartPayload {
  const lines = new Map<string, number>();
  for (const it of input.items) {
    const p = findProduct(it.productId);
    if (p) lines.set(p.id, Math.min(MAX_QTY_PER_ITEM, (lines.get(p.id) ?? 0) + it.quantity));
  }
  const saved = new Set<string>();
  for (const id of input.savedForLater) {
    const p = findProduct(id);
    if (p && !lines.has(p.id)) saved.add(p.id);
  }
  return {
    items: Array.from(lines, ([productId, quantity]) => ({ productId, quantity })),
    savedForLater: Array.from(saved),
    couponCode: input.couponCode ? input.couponCode.toUpperCase() : null,
    giftWrap: input.giftWrap,
    giftMessage: input.giftWrap ? input.giftMessage.trim() : "",
  };
}

function serialiseCart(doc: InstanceType<typeof Cart> | null) {
  return {
    items: (doc?.items ?? []).map((i) => ({ productId: i.productId, quantity: i.quantity })),
    savedForLater: doc?.savedForLater ?? [],
    couponCode: doc?.couponCode ?? null,
    giftWrap: doc?.giftWrap ?? false,
    giftMessage: doc?.giftMessage ?? "",
    updatedAt: doc?.updatedAt ?? null,
  };
}

export function cartRouter(): Router {
  const r = Router();

  r.get("/catalog/products", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(PRODUCTS.map(({ imagePath, ...p }) => ({ ...p, image: imagePath })));
  });

  r.get("/coupons", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(COUPONS);
  });

  r.get("/delivery/:pincode", (req, res) => {
    const pin = pincodeSchema.safeParse(req.params.pincode);
    if (!pin.success) return res.status(400).json({ message: pin.error.issues[0].message });
    res.json(deliveryFor(pin.data));
  });

  /** Authoritative price for a cart. Public: guests use it too. */
  r.post(
    "/cart/quote",
    rateLimit({ name: "quote", windowMs: 60_000, max: 120 }),
    route(async (req, res) => {
      const input = parseBody(quoteInputSchema, req.body);
      res.json(await quoteWithLiveStock(input));
    }),
  );

  r.get(
    "/cart",
    requireAuth,
    requireDb,
    route(async (req, res) => {
      res.json(serialiseCart(await Cart.findOne({ userId: req.auth!.id })));
    }),
  );

  r.put(
    "/cart",
    requireAuth,
    requireDb,
    route(async (req, res) => {
      const cart = normaliseCart(parseBody(cartSchema, req.body));
      const doc = await Cart.findOneAndUpdate(
        { userId: req.auth!.id },
        { $set: cart },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      res.json(serialiseCart(doc));
    }),
  );

  r.delete(
    "/cart",
    requireAuth,
    requireDb,
    route(async (req, res) => {
      await Cart.updateOne(
        { userId: req.auth!.id },
        { $set: { items: [], couponCode: null, giftWrap: false, giftMessage: "" } },
      );
      res.status(204).end();
    }),
  );

  return r;
}
