import { Router, type Request } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import {
  SLOT_TIMES,
  bookingInputSchema,
  findService,
  findStylist,
  nowInIndia,
  slotProblem,
  type Availability,
} from "@shared/booking";
import { optionalAuth, requireAuth } from "../auth";
import { env } from "../env";
import { HttpError, parseBody, rateLimit, requireDb, route } from "../http";
import { Booking } from "../mongodb";

type BookingDoc = InstanceType<typeof Booking>;

const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

function newBookingNumber(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const ymd = nowInIndia().date.slice(2).replace(/-/g, "");
  return `GB${ymd}${Array.from(crypto.randomBytes(5), (b) => alphabet[b % alphabet.length]).join("")}`;
}

function upiLink(b: BookingDoc): string | null {
  if (!env.upiId) return null;
  const params = new URLSearchParams({ pa: env.upiId, pn: "GlowGrace", am: b.price.toFixed(2), cu: "INR", tn: `Booking ${b.bookingNumber}` });
  return `upi://pay?${params.toString()}`;
}

export function publicBooking(b: BookingDoc) {
  const o = b.toObject();
  return {
    id: o._id.toString(),
    bookingNumber: o.bookingNumber,
    serviceId: o.serviceId,
    serviceName: o.serviceName,
    durationMin: o.durationMin,
    stylistId: o.stylistId,
    stylistName: o.stylistName,
    date: o.date,
    time: o.time,
    price: o.price,
    customer: o.customer,
    notes: o.notes,
    payment: {
      method: o.payment!.method,
      status: o.payment!.status,
      transactionId: o.payment!.transactionId,
      upiLink: o.status === "pending_payment" ? upiLink(b) : null,
    },
    status: o.status,
    createdAt: o.createdAt,
  };
}

async function findAccessibleBooking(req: Request, idOrNumber: string): Promise<BookingDoc> {
  const filter = mongoose.isValidObjectId(idOrNumber) ? { _id: idOrNumber } : { bookingNumber: idOrNumber };
  const b = await Booking.findOne(filter);
  const key = req.header("x-booking-key");
  const allowed =
    b &&
    ((req.auth && b.userId === req.auth.id) ||
      req.auth?.isAdmin ||
      (key && crypto.timingSafeEqual(Buffer.from(hashKey(key)), Buffer.from(b.accessKeyHash))));
  if (!b || !allowed) throw new HttpError(404, "Booking not found.");
  return b;
}

export async function cancelBooking(b: BookingDoc) {
  b.status = "cancelled";
  b.set("slotKey", undefined); // frees the slot
  if (b.payment!.status === "awaiting_payment" || b.payment!.status === "pay_at_salon") b.payment!.status = "failed";
  await b.save();
}

export function bookingsRouter(): Router {
  const r = Router();

  /** Which stylists are taken at each slot on a date, plus slots that have passed. */
  r.get(
    "/bookings/availability",
    requireDb,
    route(async (req, res) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.date);
      if (!date.success) throw new HttpError(400, "date must be YYYY-MM-DD");
      const active = await Booking.find(
        { date: date.data, status: { $in: ["pending_payment", "confirmed"] } },
        { stylistId: 1, time: 1 },
      ).lean();
      const taken: Availability["taken"] = Object.fromEntries(SLOT_TIMES.map((t) => [t, [] as number[]]));
      for (const b of active) taken[b.time]?.push(b.stylistId);
      const closed = SLOT_TIMES.filter((t) => slotProblem(date.data, t) !== null);
      res.set("Cache-Control", "no-store");
      res.json({ date: date.data, taken, closed } satisfies Availability);
    }),
  );

  r.post(
    "/bookings",
    rateLimit({ name: "create-booking", windowMs: 60_000, max: 10 }),
    optionalAuth,
    requireDb,
    route(async (req, res) => {
      const body = parseBody(bookingInputSchema, req.body);

      if (body.idempotencyKey) {
        const existing = await Booking.findOne({ idempotencyKey: body.idempotencyKey });
        if (existing) return res.json({ booking: publicBooking(existing), accessKey: null, duplicate: true });
      }

      const problem = slotProblem(body.date, body.time);
      if (problem) throw new HttpError(422, problem);
      const service = findService(body.serviceId)!;
      const stylist = findStylist(body.stylistId)!;

      const accessKey = crypto.randomBytes(24).toString("base64url");
      const isUpi = body.paymentMethod === "upi";
      let booking: BookingDoc | undefined;
      for (let attempt = 0; !booking && attempt < 3; attempt++) {
        try {
          booking = await Booking.create({
            bookingNumber: newBookingNumber(),
            userId: req.auth?.id,
            accessKeyHash: hashKey(accessKey),
            idempotencyKey: body.idempotencyKey,
            serviceId: service.id,
            serviceName: service.name,
            durationMin: service.durationMin,
            stylistId: stylist.id,
            stylistName: stylist.name,
            date: body.date,
            time: body.time,
            slotKey: `${stylist.id}|${body.date}|${body.time}`,
            price: service.price,
            customer: body.customer,
            notes: body.notes,
            payment: { method: body.paymentMethod, status: isUpi ? "awaiting_payment" : "pay_at_salon" },
            status: isUpi ? "pending_payment" : "confirmed",
          });
        } catch (e: any) {
          if (e?.code === 11000 && e?.keyPattern?.slotKey) {
            throw new HttpError(409, `${stylist.name} was just booked at that time. Please pick another slot.`);
          }
          if (e?.code !== 11000 || !e?.keyPattern?.bookingNumber) throw e;
        }
      }
      if (!booking) throw new Error("Could not allocate a booking number");
      res.status(201).json({ booking: publicBooking(booking), accessKey });
    }),
  );

  r.get(
    "/bookings",
    requireAuth,
    requireDb,
    route(async (req, res) => {
      const list = await Booking.find({ userId: req.auth!.id }).sort({ date: -1, time: -1 }).limit(100);
      res.json(list.map(publicBooking));
    }),
  );

  r.get(
    "/bookings/:id",
    optionalAuth,
    requireDb,
    route(async (req, res) => {
      res.json(publicBooking(await findAccessibleBooking(req, req.params.id)));
    }),
  );

  r.post(
    "/bookings/:id/payment",
    rateLimit({ name: "booking-payment", windowMs: 60_000, max: 10 }),
    optionalAuth,
    requireDb,
    route(async (req, res) => {
      const { transactionId } = parseBody(
        z.object({ transactionId: z.string().trim().regex(/^[A-Za-z0-9]{6,35}$/, "Enter the 12-digit UPI reference (UTR) from your payment app") }),
        req.body,
      );
      const b = await findAccessibleBooking(req, req.params.id);
      if (b.status === "cancelled") throw new HttpError(409, "This booking expired or was cancelled. Please book again.");
      if (b.payment!.method !== "upi" || !["awaiting_payment", "verification_pending"].includes(b.payment!.status)) {
        throw new HttpError(409, "Payment for this booking has already been processed.");
      }
      b.payment!.transactionId = transactionId.toUpperCase();
      b.payment!.status = "verification_pending";
      b.payment!.submittedAt = new Date();
      b.status = "confirmed";
      await b.save();
      res.json(publicBooking(b));
    }),
  );

  r.post(
    "/bookings/:id/cancel",
    optionalAuth,
    requireDb,
    route(async (req, res) => {
      const b = await findAccessibleBooking(req, req.params.id);
      if (b.status === "cancelled" || b.status === "completed") throw new HttpError(409, "This booking can't be cancelled.");
      await cancelBooking(b);
      res.json(publicBooking(b));
    }),
  );

  return r;
}

/** Frees slots held by UPI bookings that were never paid. */
export function startUnpaidBookingSweeper(): NodeJS.Timeout {
  const sweep = async () => {
    if (mongoose.connection.readyState !== 1) return;
    const cutoff = new Date(Date.now() - env.unpaidOrderTtlMinutes * 60_000);
    const stale = await Booking.find({ status: "pending_payment", "payment.status": "awaiting_payment", createdAt: { $lt: cutoff } }).limit(100);
    for (const b of stale) await cancelBooking(b).catch((e) => console.error(`[bookings] failed to expire ${b.bookingNumber}:`, e));
    if (stale.length) console.log(`[bookings] released ${stale.length} unpaid slot(s)`);
  };
  const timer = setInterval(() => void sweep().catch((e) => console.error("[bookings] sweep failed:", e)), 5 * 60_000);
  timer.unref();
  return timer;
}
