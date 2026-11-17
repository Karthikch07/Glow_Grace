import mongoose from "mongoose";
import { env } from "./env";

// ---------------------------------------------------------------- connection

let retryTimer: NodeJS.Timeout | undefined;

/**
 * Connects in the background and keeps retrying, so the API still boots (and
 * serves catalogue, quotes and health) when MongoDB is briefly unavailable.
 * Routes that need the database are guarded by `requireDb`.
 */
export async function connectMongoDB(): Promise<void> {
  mongoose.set("strictQuery", true);
  // Fail fast instead of buffering queries for 10s when disconnected.
  mongoose.set("bufferCommands", false);

  const attempt = async () => {
    try {
      await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
      console.log("[mongo] connected");
      await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes().catch(() => undefined)));
    } catch (error: any) {
      console.error(`[mongo] connection failed: ${error?.message}. Retrying in 10s.`);
      retryTimer = setTimeout(attempt, 10_000);
    }
  };
  await attempt();
}

export function isDbReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectMongoDB(): Promise<void> {
  if (retryTimer) clearTimeout(retryTimer);
  await mongoose.disconnect();
}

const { Schema } = mongoose;

// ---------------------------------------------------------------- catalogue

const serviceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    description: { type: String, required: true },
    duration: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, required: true },
  },
  { timestamps: true },
);

const productSchema = new Schema(
  {
    /** Matches `CatalogProduct.id` in shared/catalog.ts. */
    sku: { type: String, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true },
    description: { type: String, required: true },
    size: { type: String },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    image: { type: String, required: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviews: { type: Number, default: 0, min: 0 },
    category: { type: String, required: true, index: true },
    stock: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// ---------------------------------------------------------------- users

const userSchema = new Schema(
  {
    // Optional because phone-only Firebase accounts have no email.
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    /** bcrypt hash; absent for accounts that only sign in through Firebase. */
    passwordHash: { type: String },
    firebaseUid: { type: String, unique: true, sparse: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, trim: true },
    photoURL: { type: String },
    authProvider: { type: String, enum: ["password", "google", "phone"], default: "password" },
  },
  { timestamps: true },
);

// ---------------------------------------------------------------- cart

const cartLineSchema = new Schema(
  {
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, max: 10 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const cartSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    items: { type: [cartLineSchema], default: [] },
    savedForLater: { type: [String], default: [] },
    couponCode: { type: String, default: null },
    giftWrap: { type: Boolean, default: false },
    giftMessage: { type: String, default: "", maxlength: 200 },
  },
  { timestamps: true },
);

// ---------------------------------------------------------------- orders

export const ORDER_STATUSES = [
  "pending_payment", // UPI order created, waiting for the customer to pay
  "placed", // paid (awaiting verification) or COD; waiting to be packed
  "confirmed", // payment verified / COD confirmed by the store
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "awaiting_payment",
  "verification_pending",
  "paid",
  "cod_pending",
  "failed",
  "refunded",
] as const;

const orderLineSchema = new Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    brand: String,
    size: String,
    unitPrice: { type: Number, required: true },
    unitMrp: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const addressSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    locality: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    type: { type: String, enum: ["HOME", "WORK"], default: "HOME" },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: String, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    /** SHA-256 of the guest access key. Lets guests view and pay for their order. */
    accessKeyHash: { type: String, required: true },
    idempotencyKey: { type: String, unique: true, sparse: true },
    items: { type: [orderLineSchema], required: true },
    pricing: {
      mrpTotal: { type: Number, required: true },
      subtotal: { type: Number, required: true },
      mrpDiscount: { type: Number, required: true },
      couponCode: { type: String, default: null },
      couponDiscount: { type: Number, default: 0 },
      giftWrapFee: { type: Number, default: 0 },
      shippingFee: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },
    gift: {
      wrap: { type: Boolean, default: false },
      message: { type: String, default: "" },
    },
    shippingAddress: { type: addressSchema, required: true },
    delivery: {
      minDays: Number,
      maxDays: Number,
      estimatedBy: Date,
    },
    payment: {
      method: { type: String, enum: ["upi", "cod"], required: true },
      status: { type: String, enum: PAYMENT_STATUSES, required: true },
      transactionId: { type: String },
      submittedAt: Date,
      verifiedAt: Date,
    },
    status: { type: String, enum: ORDER_STATUSES, required: true, index: true },
    /** True while this order holds reserved stock in the products collection. */
    stockReserved: { type: Boolean, default: false },
    history: [
      {
        _id: false,
        status: String,
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
orderSchema.index({ status: 1, createdAt: 1 });

// ---------------------------------------------------------------- bookings & reviews

export const BOOKING_STATUSES = ["pending_payment", "confirmed", "completed", "cancelled"] as const;

const bookingSchema = new Schema(
  {
    bookingNumber: { type: String, required: true, unique: true },
    userId: { type: String, index: true },
    accessKeyHash: { type: String, required: true },
    idempotencyKey: { type: String, unique: true, sparse: true },
    serviceId: { type: Number, required: true },
    serviceName: { type: String, required: true },
    durationMin: { type: Number, required: true },
    stylistId: { type: Number, required: true },
    stylistName: { type: String, required: true },
    /** "YYYY-MM-DD" and "HH:MM", salon local time (IST). */
    date: { type: String, required: true, index: true },
    time: { type: String, required: true },
    /**
     * "stylistId|date|time" while the booking holds its slot; removed when
     * cancelled. The unique index makes double-booking impossible, even
     * under concurrent requests.
     */
    slotKey: { type: String, unique: true, sparse: true },
    price: { type: Number, required: true, min: 0 },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
    },
    notes: { type: String, default: "" },
    payment: {
      method: { type: String, enum: ["upi", "salon"], required: true },
      status: { type: String, enum: ["awaiting_payment", "verification_pending", "paid", "pay_at_salon", "failed", "refunded"], required: true },
      transactionId: String,
      submittedAt: Date,
    },
    status: { type: String, enum: BOOKING_STATUSES, required: true, index: true },
  },
  { timestamps: true },
);

const reviewSchema = new Schema(
  {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    serviceId: { type: String, index: true },
    productId: { type: String, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// ---------------------------------------------------------------- audit log

/** Append-only record of every change staff make through /api/admin. */
const auditLogSchema = new Schema(
  {
    actorId: { type: String, required: true },
    actorEmail: { type: String },
    action: { type: String, required: true },
    entity: { type: String, enum: ["order", "booking", "product"], required: true },
    entityRef: { type: String, required: true },
    summary: { type: String, required: true, maxlength: 500 },
    changes: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, entityRef: 1, createdAt: -1 });

export const Service = mongoose.model("Service", serviceSchema);
export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export const Product = mongoose.model("Product", productSchema);
export const User = mongoose.model("User", userSchema);
export const Cart = mongoose.model("Cart", cartSchema);
export const Order = mongoose.model("Order", orderSchema);
export const Booking = mongoose.model("Booking", bookingSchema);
export const Review = mongoose.model("Review", reviewSchema);
