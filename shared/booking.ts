/**
 * Salon services, stylists and appointment slots, shared by client and
 * server. The server prices bookings and checks slot availability from
 * this file; the client only displays it.
 */
import { z } from "zod";
import { emailSchema, phoneSchema } from "./checkout";

export interface SalonService {
  id: number;
  name: string;
  category: "Spa" | "Barbershop" | "Fitness" | "MedSpa" | "Salon";
  description: string;
  durationMin: number;
  price: number;
  imagePath: string;
}

export const SERVICES: SalonService[] = [
  { id: 1, name: "Relaxation Massage", category: "Spa", description: "Full body massage with aromatherapy", durationMin: 60, price: 1150, imagePath: "/assets/stock_images/spa_massage_therapy__0dc874f5.jpg" },
  { id: 2, name: "Hot Stone Therapy", category: "Spa", description: "Deep tissue massage with heated stones", durationMin: 90, price: 1450, imagePath: "/assets/stock_images/hot_stone_massage_6c34b301.jpg" },
  { id: 3, name: "Classic Haircut", category: "Barbershop", description: "Traditional cut with hot towel finish", durationMin: 30, price: 149, imagePath: "/assets/stock_images/modern_barbershop_in_ed205b41.jpg" },
  { id: 4, name: "Beard Grooming", category: "Barbershop", description: "Trim, shape and conditioning", durationMin: 20, price: 99, imagePath: "/assets/stock_images/breadgrooming.jpg" },
  { id: 5, name: "Personal Training", category: "Fitness", description: "One-on-one fitness coaching", durationMin: 60, price: 99, imagePath: "/assets/stock_images/Personal Training.jpeg" },
  { id: 6, name: "Yoga Class", category: "Fitness", description: "Group yoga session for all levels", durationMin: 45, price: 125, imagePath: "/assets/stock_images/yoga_fitness_class_51fa1f1f.jpg" },
  { id: 7, name: "Botox Treatment", category: "MedSpa", description: "Professional wrinkle reduction", durationMin: 30, price: 1350, imagePath: "/assets/stock_images/Botox Treatment.jpeg" },
  { id: 8, name: "Hair Styling", category: "Salon", description: "Professional styling for any occasion", durationMin: 45, price: 285, imagePath: "/assets/stock_images/hair_salon_styling_c_a9b33900.jpg" },
];

export interface Stylist {
  id: number;
  name: string;
  specialty: string;
  rating: number;
}

export const STYLISTS: Stylist[] = [
  { id: 1, name: "Sahed Ali", specialty: "Hair Specialist", rating: 4.9 },
  { id: 2, name: "Dilshad", specialty: "Hair Colouring", rating: 4.8 },
  { id: 3, name: "Sarfaraz", specialty: "Spa Therapist", rating: 5.0 },
];

/** Slot start times, 24-hour "HH:MM", in salon local time (IST). */
export const SLOT_TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"] as const;
export type SlotTime = (typeof SLOT_TIMES)[number];

/** How far ahead customers can book. */
export const BOOKING_WINDOW_DAYS = 30;
/** A slot can't be booked less than this many minutes before it starts. */
export const MIN_LEAD_MINUTES = 30;
/** The salon is closed on these weekdays (0 = Sunday). Empty: open every day. */
export const CLOSED_WEEKDAYS: number[] = [];

export const findService = (id: unknown) => SERVICES.find((s) => s.id === Number(id));
export const findStylist = (id: unknown) => STYLISTS.find((s) => s.id === Number(id));

export function formatSlot(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDuration(min: number): string {
  return `${min} min`;
}

// ---------------------------------------------------------------- India time

const IST_OFFSET_MIN = 330;

/** Current date ("YYYY-MM-DD") and minutes since midnight in India. */
export function nowInIndia(now = new Date()): { date: string; minutes: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return { date: ist.toISOString().slice(0, 10), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The bookable dates, starting today (India time). */
export function bookableDates(now = new Date()): string[] {
  const today = nowInIndia(now).date;
  return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, i) => addDays(today, i)).filter(
    (d) => !CLOSED_WEEKDAYS.includes(weekdayOf(d)),
  );
}

/** Why a date/time can't be booked right now, or null if it can. */
export function slotProblem(date: string, time: string, now = new Date()): string | null {
  if (!(SLOT_TIMES as readonly string[]).includes(time)) return "That time isn't one of our appointment slots.";
  if (!bookableDates(now).includes(date)) return `Please pick a date within the next ${BOOKING_WINDOW_DAYS} days.`;
  const { date: today, minutes } = nowInIndia(now);
  if (date === today) {
    const [h, m] = time.split(":").map(Number);
    if (h * 60 + m - minutes < MIN_LEAD_MINUTES) return "That time has already passed. Please choose a later slot.";
  }
  return null;
}

// ---------------------------------------------------------------- API shapes

export const BOOKING_PAYMENT_METHODS = ["upi", "salon"] as const;
export type BookingPaymentMethod = (typeof BOOKING_PAYMENT_METHODS)[number];

export const bookingInputSchema = z.object({
  serviceId: z.number().int().refine((id) => Boolean(findService(id)), "Please choose a service"),
  stylistId: z.number().int().refine((id) => Boolean(findStylist(id)), "Please choose a stylist"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a date"),
  time: z.enum(SLOT_TIMES, { errorMap: () => ({ message: "Please choose a time slot" }) }),
  customer: z.object({
    name: z.string().trim().min(2, "Enter your name").max(100),
    phone: phoneSchema,
    email: emailSchema,
  }),
  notes: z.string().trim().max(300).optional().default(""),
  paymentMethod: z.enum(BOOKING_PAYMENT_METHODS),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});
export type BookingInput = z.input<typeof bookingInputSchema>;

export interface Availability {
  date: string;
  /** For each slot time, the ids of stylists who are already booked. */
  taken: Record<string, number[]>;
  /** Slot times that have passed or are too soon to book. */
  closed: string[];
}

export interface BookingView {
  id: string;
  bookingNumber: string;
  serviceId: number;
  serviceName: string;
  durationMin: number;
  stylistId: number;
  stylistName: string;
  date: string;
  time: string;
  price: number;
  customer: { name: string; phone: string; email: string };
  notes: string;
  payment: { method: BookingPaymentMethod; status: string; transactionId?: string; upiLink: string | null };
  status: "pending_payment" | "confirmed" | "completed" | "cancelled";
  createdAt: string;
}
