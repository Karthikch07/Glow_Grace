import type { Availability, BookingInput, BookingView } from "@shared/booking";
import { api } from "./api";

/** Guests manage a booking with the access key returned when it was made. */
const KEYS = "gg_booking_keys";

function readKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS) || "{}");
  } catch {
    return {};
  }
}

function headers(bookingNumber: string): Record<string, string> {
  const key = readKeys()[bookingNumber];
  return key ? { "X-Booking-Key": key } : {};
}

export function fetchAvailability(date: string, signal?: AbortSignal) {
  return api<Availability>(`/api/bookings/availability?date=${date}`, { signal });
}

export async function createBooking(input: BookingInput) {
  const res = await api<{ booking: BookingView; accessKey: string | null }>("/api/bookings", { body: input });
  if (res.accessKey) {
    try {
      const keys = readKeys();
      keys[res.booking.bookingNumber] = res.accessKey;
      localStorage.setItem(KEYS, JSON.stringify(keys));
    } catch {
      /* ignore */
    }
  }
  return res.booking;
}

export function submitBookingPayment(bookingNumber: string, transactionId: string) {
  return api<BookingView>(`/api/bookings/${encodeURIComponent(bookingNumber)}/payment`, {
    body: { transactionId },
    headers: headers(bookingNumber),
  });
}

export function cancelBooking(bookingNumber: string) {
  return api<BookingView>(`/api/bookings/${encodeURIComponent(bookingNumber)}/cancel`, {
    method: "POST",
    headers: headers(bookingNumber),
  });
}
