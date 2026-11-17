const whole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const fractional = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,499 for whole rupees, ₹1,499.50 otherwise. */
export function formatCurrency(value: number | string | undefined | null) {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  const num = Number.isFinite(n) ? (n as number) : 0;
  return Number.isInteger(num) ? whole.format(num) : fractional.format(num);
}

/** "Wed, 18 Nov" */
export function formatShortDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
