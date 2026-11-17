import type { OrderView } from "@shared/checkout";
import { api } from "./api";

/**
 * Guests can only see and pay for their order with the access key returned
 * when it was created, so keep those keys in this browser.
 */
const KEYS = "gg_order_keys";

function readKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS) || "{}");
  } catch {
    return {};
  }
}

export function saveOrderKey(orderNumber: string, key: string | null) {
  if (!key) return;
  try {
    const keys = readKeys();
    keys[orderNumber] = key;
    localStorage.setItem(KEYS, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

function orderHeaders(orderNumber: string): Record<string, string> {
  const key = readKeys()[orderNumber];
  return key ? { "X-Order-Key": key } : {};
}

export function fetchOrder(orderNumber: string, signal?: AbortSignal) {
  return api<OrderView>(`/api/orders/${encodeURIComponent(orderNumber)}`, { headers: orderHeaders(orderNumber), signal });
}

export function submitPaymentReference(orderNumber: string, transactionId: string) {
  return api<OrderView>(`/api/orders/${encodeURIComponent(orderNumber)}/payment`, {
    body: { transactionId },
    headers: orderHeaders(orderNumber),
  });
}

export function cancelOrder(orderNumber: string) {
  return api<OrderView>(`/api/orders/${encodeURIComponent(orderNumber)}/cancel`, {
    method: "POST",
    headers: orderHeaders(orderNumber),
  });
}

export const ORDER_STATUS_LABEL: Record<OrderView["status"], string> = {
  pending_payment: "Awaiting payment",
  placed: "Order placed",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Waiting for your UPI payment",
  verification_pending: "UPI payment received, being verified",
  paid: "Paid",
  cod_pending: "Pay on delivery",
  failed: "Not paid",
  refunded: "Refunded",
};
