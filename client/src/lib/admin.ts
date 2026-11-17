import type { BookingView } from "@shared/booking";
import type { OrderView } from "@shared/checkout";
import { api } from "./api";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DailyPoint {
  date: string;
  orders: number;
  bookings: number;
  revenue: number;
}

export interface InventoryRow {
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  mrp: number;
  /** False until the product has a MongoDB document; stock then comes from the static catalogue. */
  tracked: boolean;
  stock: number;
  updatedAt: string | null;
}

export interface AdminStats {
  generatedAt: string;
  today: string;
  sales: { last30: number; prev30: number; change: number | null; products: number; services: number };
  orders: { last30: number; change: number | null; averageValue: number; byStatus: Record<OrderView["status"], number> };
  bookings: { last30: number; change: number | null; byStatus: Record<BookingView["status"], number>; today: BookingView[] };
  toVerify: { orders: number; bookings: number };
  lowStock: InventoryRow[];
  daily: DailyPoint[];
}

export interface AuditEntry {
  id: string;
  actorEmail?: string;
  action: string;
  entity: "order" | "booking" | "product";
  entityRef: string;
  summary: string;
  createdAt: string;
}

export interface Me {
  id: string;
  email?: string;
  displayName?: string;
  isAdmin: boolean;
}

function qs(params: Record<string, string | number | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
}

export const adminApi = {
  /** 401 when signed out, 403 when the account isn't staff. */
  session: () => api<Me>("/api/admin/session"),
  stats: () => api<AdminStats>("/api/admin/stats"),

  orders: (p: { status?: string; payment?: string; q?: string; page?: number }) => api<Page<OrderView>>(`/api/admin/orders${qs(p)}`),
  updateOrder: (orderNumber: string, body: { status?: string; paymentStatus?: string; note?: string }) =>
    api<OrderView>(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, { method: "PATCH", body }),

  bookings: (p: { status?: string; payment?: string; date?: string; q?: string; page?: number }) =>
    api<Page<BookingView>>(`/api/admin/bookings${qs(p)}`),
  updateBooking: (bookingNumber: string, body: { status?: string; paymentStatus?: string; note?: string }) =>
    api<BookingView>(`/api/admin/bookings/${encodeURIComponent(bookingNumber)}`, { method: "PATCH", body }),

  inventory: () => api<{ items: InventoryRow[]; lowStockThreshold: number }>("/api/admin/inventory"),
  setStock: (sku: string, body: { stock: number } | { adjust: number }) =>
    api<InventoryRow>(`/api/admin/inventory/${encodeURIComponent(sku)}`, { method: "PATCH", body }),

  audit: (p: { entity?: string; ref?: string; page?: number }) => api<Page<AuditEntry>>(`/api/admin/audit${qs(p)}`),
};

/** Next statuses staff may pick; mirrors NEXT_STATUS in server/routes/orders.ts. */
export const ORDER_NEXT: Record<OrderView["status"], OrderView["status"][]> = {
  pending_payment: ["placed", "cancelled"],
  placed: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** Mirrors NEXT_BOOKING_STATUS in server/admin-logic.ts. */
export const BOOKING_NEXT: Record<BookingView["status"], BookingView["status"][]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const ORDER_STATUS: Record<OrderView["status"], string> = {
  pending_payment: "Awaiting payment",
  placed: "Placed",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const BOOKING_STATUS: Record<BookingView["status"], string> = {
  pending_payment: "Awaiting payment",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS: Record<string, string> = {
  awaiting_payment: "Unpaid",
  verification_pending: "To verify",
  paid: "Paid",
  cod_pending: "Cash on delivery",
  pay_at_salon: "Pay at salon",
  failed: "Not paid",
  refunded: "Refunded",
};
