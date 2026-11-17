/**
 * Cart pricing engine, shared by client and server.
 *
 * The client runs it for instant feedback; the server runs the same code
 * against its own catalogue when quoting and creating orders, so a tampered
 * client can never change what is charged.
 *
 * All amounts are whole rupees (INR) and inclusive of GST.
 */
import { z } from "zod";
import { findProduct, type CatalogProduct } from "./catalog";

export const MAX_QTY_PER_ITEM = 10;
export const MAX_LINES = 50;
export const FREE_SHIPPING_THRESHOLD = 999;
export const SHIPPING_FEE = 49;
export const GIFT_WRAP_FEE = 35;
export const GIFT_MESSAGE_MAX = 200;

export interface Coupon {
  code: string;
  title: string;
  description: string;
  minSubtotal: number;
  kind: "percent" | "flat";
  value: number;
  /** Upper bound on the discount for percentage coupons. */
  maxDiscount?: number;
}

export const COUPONS: Coupon[] = [
  {
    code: "GLOW20",
    title: "20% off",
    description: "20% off skincare and makeup, up to ₹300.",
    minSubtotal: 799,
    kind: "percent",
    value: 20,
    maxDiscount: 300,
  },
  {
    code: "BEAUTY100",
    title: "Flat ₹100 off",
    description: "₹100 off orders of ₹699 or more.",
    minSubtotal: 699,
    kind: "flat",
    value: 100,
  },
  {
    code: "FIRST10",
    title: "10% welcome offer",
    description: "10% off your first order, up to ₹150.",
    minSubtotal: 499,
    kind: "percent",
    value: 10,
    maxDiscount: 150,
  },
];

export function findCoupon(code: string | undefined | null): Coupon | undefined {
  if (!code) return undefined;
  const normalized = code.trim().toUpperCase();
  return COUPONS.find((c) => c.code === normalized);
}

export function couponDiscountFor(coupon: Coupon, subtotal: number): number {
  if (subtotal < coupon.minSubtotal) return 0;
  const raw = coupon.kind === "percent" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  const capped = coupon.maxDiscount != null ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.min(capped, subtotal);
}

// ---------------------------------------------------------------- input schema

export const cartLineInputSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(MAX_QTY_PER_ITEM),
});

export const quoteInputSchema = z.object({
  items: z.array(cartLineInputSchema).max(MAX_LINES),
  couponCode: z.string().trim().max(30).optional().nullable(),
  giftWrap: z.boolean().optional().default(false),
});

export type CartLineInput = z.infer<typeof cartLineInputSchema>;
export type QuoteInput = z.input<typeof quoteInputSchema>;

// ---------------------------------------------------------------- output types

export interface QuoteLine {
  productId: string;
  name: string;
  brand: string;
  size: string;
  unitPrice: number;
  unitMrp: number;
  quantity: number;
  lineTotal: number;
  lineMrp: number;
  stock: number;
}

export type QuoteIssue =
  | { type: "unknown_product"; productId: string }
  | { type: "quantity_reduced"; productId: string; requested: number; available: number }
  | { type: "out_of_stock"; productId: string };

export type CouponState =
  | { status: "none" }
  | { status: "applied"; code: string; discount: number }
  | { status: "invalid"; code: string; reason: string }
  | { status: "below_minimum"; code: string; reason: string; shortBy: number };

export interface Quote {
  lines: QuoteLine[];
  issues: QuoteIssue[];
  itemCount: number;
  mrpTotal: number;
  subtotal: number;
  mrpDiscount: number;
  coupon: CouponState;
  couponDiscount: number;
  giftWrap: boolean;
  giftWrapFee: number;
  shippingFee: number;
  /** Rupees still needed for free shipping; 0 once it is unlocked. */
  freeShippingRemaining: number;
  total: number;
  totalSavings: number;
}

/**
 * Price a cart. Unknown products are dropped and quantities are clamped to
 * stock; each adjustment is reported in `issues` so the UI can explain it.
 */
export function computeQuote(
  input: QuoteInput,
  lookup: (id: string) => CatalogProduct | undefined = findProduct,
): Quote {
  const issues: QuoteIssue[] = [];
  const merged = new Map<string, { product: CatalogProduct; quantity: number }>();

  for (const raw of input.items ?? []) {
    const product = lookup(raw.productId);
    if (!product) {
      issues.push({ type: "unknown_product", productId: raw.productId });
      continue;
    }
    const prev = merged.get(product.id);
    merged.set(product.id, { product, quantity: (prev?.quantity ?? 0) + raw.quantity });
  }

  const lines: QuoteLine[] = [];
  for (const { product, quantity: requested } of Array.from(merged.values())) {
    const available = Math.min(product.stock, MAX_QTY_PER_ITEM);
    if (available <= 0) {
      issues.push({ type: "out_of_stock", productId: product.id });
      continue;
    }
    const quantity = Math.min(requested, available);
    if (quantity < requested) {
      issues.push({ type: "quantity_reduced", productId: product.id, requested, available });
    }
    const unitMrp = Math.max(product.mrp, product.price);
    lines.push({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      size: product.size,
      unitPrice: product.price,
      unitMrp,
      quantity,
      lineTotal: product.price * quantity,
      lineMrp: unitMrp * quantity,
      stock: product.stock,
    });
  }

  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = lines.reduce((n, l) => n + l.lineTotal, 0);
  const mrpTotal = lines.reduce((n, l) => n + l.lineMrp, 0);
  const mrpDiscount = mrpTotal - subtotal;

  let coupon: CouponState = { status: "none" };
  let couponDiscount = 0;
  const rawCode = input.couponCode?.trim();
  if (rawCode) {
    const found = findCoupon(rawCode);
    if (!found) {
      coupon = { status: "invalid", code: rawCode.toUpperCase(), reason: "This coupon code doesn't exist." };
    } else if (subtotal < found.minSubtotal) {
      const shortBy = found.minSubtotal - subtotal;
      coupon = {
        status: "below_minimum",
        code: found.code,
        shortBy,
        reason: `Add items worth ₹${shortBy} more to use ${found.code}.`,
      };
    } else {
      couponDiscount = couponDiscountFor(found, subtotal);
      coupon = { status: "applied", code: found.code, discount: couponDiscount };
    }
  }

  const giftWrap = Boolean(input.giftWrap) && lines.length > 0;
  const giftWrapFee = giftWrap ? GIFT_WRAP_FEE : 0;
  const qualifies = subtotal >= FREE_SHIPPING_THRESHOLD;
  const shippingFee = lines.length === 0 || qualifies ? 0 : SHIPPING_FEE;
  const freeShippingRemaining = lines.length === 0 || qualifies ? 0 : FREE_SHIPPING_THRESHOLD - subtotal;

  const total = Math.max(0, subtotal - couponDiscount + giftWrapFee + shippingFee);

  return {
    lines,
    issues,
    itemCount,
    mrpTotal,
    subtotal,
    mrpDiscount,
    coupon,
    couponDiscount,
    giftWrap,
    giftWrapFee,
    shippingFee,
    freeShippingRemaining,
    total,
    totalSavings: mrpDiscount + couponDiscount,
  };
}

// ---------------------------------------------------------------- delivery

export const pincodeSchema = z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code");

export interface DeliveryEstimate {
  pincode: string;
  serviceable: boolean;
  /** Inclusive range of business days from dispatch. */
  minDays: number;
  maxDays: number;
  codAvailable: boolean;
  zone: "local" | "metro" | "national" | "remote";
}

/** Hyderabad pin prefixes get same-region delivery from the Miyapur store. */
const LOCAL_PREFIXES = ["500", "501", "502"];
const METRO_PREFIXES = ["110", "400", "560", "600", "700", "411", "380"];
/** North-east, Andaman and Lakshadweep, Ladakh: slower couriers, no COD. */
const REMOTE_PREFIXES = ["744", "682555", "194", "79"];

export function estimateDelivery(pincode: string): DeliveryEstimate {
  const startsWith = (list: string[]) => list.some((p) => pincode.startsWith(p));
  if (startsWith(LOCAL_PREFIXES)) {
    return { pincode, serviceable: true, minDays: 1, maxDays: 2, codAvailable: true, zone: "local" };
  }
  if (startsWith(METRO_PREFIXES)) {
    return { pincode, serviceable: true, minDays: 2, maxDays: 4, codAvailable: true, zone: "metro" };
  }
  if (startsWith(REMOTE_PREFIXES)) {
    return { pincode, serviceable: true, minDays: 6, maxDays: 9, codAvailable: false, zone: "remote" };
  }
  return { pincode, serviceable: true, minDays: 3, maxDays: 6, codAvailable: true, zone: "national" };
}

/** Add business days (Mon–Sat; couriers do not deliver on Sunday). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++;
  }
  return d;
}
