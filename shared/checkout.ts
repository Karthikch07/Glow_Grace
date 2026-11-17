import { z } from "zod";
import { pincodeSchema } from "./pricing";

/** Accepts "+91 98765 43210", "098765-43210" etc. and normalises to 10 digits. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"));

export const addressSchema = z.object({
  name: z.string().trim().min(2, "Enter the recipient's name").max(100),
  phone: phoneSchema,
  line1: z.string().trim().min(5, "Enter your flat, building and street").max(200),
  locality: z.string().trim().min(2, "Enter your locality").max(100),
  city: z.string().trim().min(2, "Enter your city").max(60),
  state: z.string().trim().min(2, "Enter your state").max(60),
  pincode: pincodeSchema,
  type: z.enum(["HOME", "WORK"]).default("HOME"),
});

export type Address = z.infer<typeof addressSchema>;
export type AddressInput = z.input<typeof addressSchema>;

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(150);

export const PAYMENT_METHODS = ["upi", "cod"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
];

/** Public order shape returned by the API. */
export interface OrderView {
  id: string;
  orderNumber: string;
  email: string;
  items: Array<{ productId: string; name: string; brand?: string; size?: string; unitPrice: number; unitMrp: number; quantity: number; lineTotal: number }>;
  pricing: {
    mrpTotal: number;
    subtotal: number;
    mrpDiscount: number;
    couponCode: string | null;
    couponDiscount: number;
    giftWrapFee: number;
    shippingFee: number;
    total: number;
  };
  gift: { wrap: boolean; message: string };
  shippingAddress: Address;
  delivery: { minDays: number; maxDays: number; estimatedBy: string };
  payment: { method: PaymentMethod; status: string; transactionId?: string; upiLink: string | null };
  status: "pending_payment" | "placed" | "confirmed" | "shipped" | "delivered" | "cancelled";
  history: Array<{ status: string; note?: string; at: string }>;
  createdAt: string;
  updatedAt: string;
}
