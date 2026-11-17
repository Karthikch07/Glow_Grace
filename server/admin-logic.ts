/**
 * Pure helpers behind the admin API, kept free of Express and MongoDB so they
 * can be unit tested (see server/admin-logic.test.ts).
 */
import { addDays } from "@shared/booking";

export const BOOKING_STATUSES = ["pending_payment", "confirmed", "completed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Allowed manual booking transitions for staff. */
export const NEXT_BOOKING_STATUS: Record<BookingStatus, BookingStatus[]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canMoveBooking(from: string, to: string): boolean {
  return (NEXT_BOOKING_STATUS[from as BookingStatus] ?? []).includes(to as BookingStatus);
}

export interface DailyPoint {
  date: string;
  orders: number;
  bookings: number;
  revenue: number;
}

/**
 * Turns sparse per-day aggregates into a continuous series of `days` points
 * ending on `endDate` (inclusive), so charts show gaps as zero rather than
 * skipping them.
 */
export function fillDailySeries(
  endDate: string,
  days: number,
  orderRows: { _id: string; count: number; revenue: number }[],
  bookingRows: { _id: string; count: number; revenue: number }[],
): DailyPoint[] {
  const orders = new Map(orderRows.map((r) => [r._id, r]));
  const bookings = new Map(bookingRows.map((r) => [r._id, r]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(endDate, i - days + 1);
    const o = orders.get(date);
    const b = bookings.get(date);
    return {
      date,
      orders: o?.count ?? 0,
      bookings: b?.count ?? 0,
      revenue: Math.round((o?.revenue ?? 0) + (b?.revenue ?? 0)),
    };
  });
}

/** Status → count map with every known status present, even when zero. */
export function countByStatus<S extends string>(statuses: readonly S[], rows: { _id: string; count: number }[]): Record<S, number> {
  const out = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<S, number>;
  for (const r of rows) if (r._id in out) out[r._id as S] = r.count;
  return out;
}

/** Percentage change from `previous` to `current`, or null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
