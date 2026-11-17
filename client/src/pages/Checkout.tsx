import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertCircle, ArrowLeft, Banknote, Loader2, Lock, Mail, MapPin, QrCode, Truck } from "lucide-react";
import { addressSchema, emailSchema, INDIAN_STATES, type AddressInput, type OrderView, type PaymentMethod } from "@shared/checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import QRPayment from "@/components/QRPayment";
import { CheckoutSteps } from "@/components/cart/CheckoutSteps";
import { useDeliveryEstimate } from "@/components/cart/DeliveryCheck";
import { PriceSummary } from "@/components/cart/PriceSummary";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart, useCartQuote } from "@/lib/cart";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { saveOrderKey, submitPaymentReference } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/ProductImage";

const ADDRESS_KEY = "gg_delivery_address";
const card = "rounded-xl border bg-card";

type FormState = AddressInput & { email: string };
type Errors = Partial<Record<keyof FormState, string>>;

function loadSavedAddress(): Partial<FormState> {
  try {
    const saved = JSON.parse(localStorage.getItem(ADDRESS_KEY) || "null");
    if (!saved) return {};
    // Older versions stored `addressLine`.
    return { ...saved, line1: saved.line1 ?? saved.addressLine ?? "" };
  } catch {
    return {};
  }
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Field({
  id,
  label,
  error,
  className,
  ...props
}: { id: keyof FormState; label: string; error?: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      <Input id={id} name={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={cn("h-11", error && "border-destructive focus-visible:ring-destructive/30")} {...props} />
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  const { items, lines, couponCode, giftWrap, giftMessage, completeOrder } = useCart();
  const { quote, verified } = useCartQuote();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(() => {
    const saved = loadSavedAddress();
    return {
      email: user?.email || saved.email || "",
      name: saved.name || user?.displayName || "",
      phone: saved.phone || user?.phoneNumber || "",
      line1: saved.line1 || "",
      locality: saved.locality || "",
      city: saved.city || "",
      state: saved.state || "",
      pincode: saved.pincode || localStorage.getItem("gg_pincode") || "",
      type: saved.type === "WORK" ? "WORK" : "HOME",
    };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<OrderView | null>(null);
  const [showQR, setShowQR] = useState(false);
  const idempotency = useRef(newKey());

  const { info: delivery } = useDeliveryEstimate(form.pincode);
  const codAvailable = delivery?.codAvailable ?? true;
  useEffect(() => {
    if (!codAvailable && method === "cod") setMethod("upi");
  }, [codAvailable, method]);

  // A different order (items, coupon, address, payment) gets a fresh idempotency key.
  const fingerprint = JSON.stringify([lines, couponCode, giftWrap, giftMessage, form, method]);
  useEffect(() => {
    idempotency.current = newKey();
  }, [fingerprint]);

  useEffect(() => {
    if (user?.email) setForm((f) => (f.email ? f : { ...f, email: user.email! }));
  }, [user?.email]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (key === "pincode") value = value.replace(/\D/g, "").slice(0, 6);
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Errors = {};
    const email = emailSchema.safeParse(form.email);
    if (!email.success) next.email = email.error.issues[0].message;
    const addr = addressSchema.safeParse(form);
    if (!addr.success) {
      for (const issue of addr.error.issues) {
        const k = issue.path[0] as keyof FormState;
        if (!next[k]) next[k] = issue.message;
      }
    }
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) document.getElementById(first)?.focus();
    return !first;
  };

  const finish = (order: OrderView) => {
    completeOrder(order.items.map((i) => i.productId));
    navigate(`/order/${order.orderNumber}`);
  };

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    if (pendingOrder) return setShowQR(true);

    setSubmitting(true);
    try {
      const { email, ...address } = form;
      const res = await api<{ order: OrderView; accessKey: string | null }>("/api/orders", {
        body: {
          items: lines.map(({ productId, quantity }) => ({ productId, quantity })),
          couponCode: quote.coupon.status === "applied" ? quote.coupon.code : null,
          giftWrap,
          giftMessage,
          email,
          address,
          paymentMethod: method,
          expectedTotal: quote.total,
          idempotencyKey: idempotency.current,
        },
      });
      try {
        localStorage.setItem(ADDRESS_KEY, JSON.stringify(form));
      } catch {
        /* ignore */
      }
      saveOrderKey(res.order.orderNumber, res.accessKey);

      if (res.order.payment.method === "cod") {
        toast({ title: "Order placed", description: `Order ${res.order.orderNumber} will be paid on delivery.` });
        finish(res.order);
      } else {
        setPendingOrder(res.order);
        setShowQR(true);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      setFormError(message);
      if (err instanceof ApiError && err.details?.issues) {
        const next: Errors = {};
        for (const i of err.details.issues as Array<{ path: string; message: string }>) {
          const k = i.path.replace(/^address\./, "") as keyof FormState;
          next[k] = i.message;
        }
        setErrors(next);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const summaryItems = useMemo(() => items, [items]);

  if (items.length === 0 && !pendingOrder) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-serif text-3xl font-semibold">Nothing to check out</h1>
        <p className="mt-2 text-muted-foreground">Your bag is empty. Add something you love first.</p>
        <Button asChild className="mt-6">
          <Link href="/products">Explore products</Link>
        </Button>
      </div>
    );
  }

  const blocked = submitting || quote.lines.length === 0 || (verified && quote.issues.length > 0);
  const amount = pendingOrder?.pricing.total ?? quote.total;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30 pb-16">
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-6">
          <div>
            <Link href="/cart" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to bag
            </Link>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Checkout</h1>
          </div>
          <CheckoutSteps current={1} />
        </div>
      </div>

      <form
        onSubmit={placeOrder}
        noValidate
        className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:py-8 xl:gap-8"
      >
        <div className="min-w-0 space-y-4">
          {formError && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{formError}</p>
            </div>
          )}
          {pendingOrder && (
            <div className="flex flex-col gap-3 rounded-xl border border-secondary/50 bg-secondary/10 p-4 text-sm sm:flex-row sm:items-center">
              <p className="flex-1">
                Order <span className="font-mono font-semibold">{pendingOrder.orderNumber}</span> is reserved for you. Complete the UPI payment to
                confirm it.
              </p>
              <Button type="button" size="sm" onClick={() => setShowQR(true)}>
                Pay {formatCurrency(pendingOrder.pricing.total)}
              </Button>
            </div>
          )}

          <fieldset className={cn(card, "p-4 sm:p-6")} disabled={!!pendingOrder}>
            <legend className="sr-only">Contact</legend>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Mail className="h-4 w-4 text-primary" /> Contact
            </h2>
            <Field id="email" label="Email for order updates" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={errors.email} />
          </fieldset>

          <fieldset className={cn(card, "p-4 sm:p-6")} disabled={!!pendingOrder}>
            <legend className="sr-only">Delivery address</legend>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-primary" /> Delivery address
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Full name" autoComplete="name" value={form.name} onChange={set("name")} error={errors.name} />
              <Field id="phone" label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="10-digit mobile" value={form.phone} onChange={set("phone")} error={errors.phone} />
              <Field id="line1" label="Flat, building, street" autoComplete="address-line1" value={form.line1} onChange={set("line1")} error={errors.line1} className="sm:col-span-2" />
              <Field id="locality" label="Locality / area" autoComplete="address-line2" value={form.locality} onChange={set("locality")} error={errors.locality} />
              <Field id="pincode" label="PIN code" inputMode="numeric" autoComplete="postal-code" value={form.pincode} onChange={set("pincode")} error={errors.pincode} />
              <Field id="city" label="City" autoComplete="address-level2" value={form.city} onChange={set("city")} error={errors.city} />
              <Field id="state" label="State" autoComplete="address-level1" list="indian-states" value={form.state} onChange={set("state")} error={errors.state} />
              <datalist id="indian-states">
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex rounded-lg border p-1" role="radiogroup" aria-label="Address type">
                {(["HOME", "WORK"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={form.type === t}
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={cn(
                      "rounded-md px-4 py-1.5 text-xs font-semibold transition-colors",
                      form.type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t === "HOME" ? "Home" : "Work"}
                  </button>
                ))}
              </div>
              {delivery && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Truck className="h-4 w-4" /> Arrives by <span className="font-semibold text-foreground">{formatShortDate(delivery.latest)}</span>
                </p>
              )}
            </div>
          </fieldset>

          <fieldset className={cn(card, "p-4 sm:p-6")} disabled={!!pendingOrder}>
            <legend className="sr-only">Payment</legend>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-primary" /> Payment
            </h2>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Payment method">
              {(
                [
                  { id: "upi", icon: QrCode, title: "UPI", body: "PhonePe, Google Pay, Paytm or any UPI app", disabled: false },
                  {
                    id: "cod",
                    icon: Banknote,
                    title: "Cash on delivery",
                    body: codAvailable ? "Pay in cash or UPI when it arrives" : "Not available for this PIN code",
                    disabled: !codAvailable,
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={method === m.id}
                  disabled={m.disabled}
                  onClick={() => setMethod(m.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    method === m.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-foreground/30",
                  )}
                >
                  <m.icon className={cn("mt-0.5 h-5 w-5 shrink-0", method === m.id ? "text-primary" : "text-muted-foreground")} />
                  <span>
                    <span className="block text-sm font-semibold">{m.title}</span>
                    <span className="block text-xs text-muted-foreground">{m.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <aside className="lg:sticky lg:top-20">
          <section className={cn(card, "p-4 sm:p-5")} aria-labelledby="order-summary">
            <h2 id="order-summary" className="mb-4 text-sm font-semibold">
              Order summary
            </h2>
            <ul className="mb-4 space-y-3 border-b pb-4">
              {summaryItems.map((it) => (
                <li key={it.id} className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <ProductImage src={it.image} alt="" className="h-12 w-12 rounded-md border" imgClassName="p-1" />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
                      {it.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">{it.size}</p>
                  </div>
                  <span className="text-sm tabular-nums">{formatCurrency(it.price * it.quantity)}</span>
                </li>
              ))}
            </ul>
            <PriceSummary quote={quote}>
              <Button type="submit" className="h-12 w-full text-base" disabled={blocked}>
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : method === "cod" ? (
                  `Place order · ${formatCurrency(amount)}`
                ) : (
                  `Pay ${formatCurrency(amount)}`
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                By placing this order you agree to our{" "}
                <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
                  terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                  privacy policy
                </Link>
                .
              </p>
            </PriceSummary>
          </section>
        </aside>
      </form>

      {pendingOrder && (
        <QRPayment
          isOpen={showQR}
          onClose={() => setShowQR(false)}
          amount={pendingOrder.pricing.total}
          reference={pendingOrder.orderNumber}
          upiLink={pendingOrder.payment.upiLink}
          title="Pay with UPI"
          description="Scan with any UPI app, then enter the reference number from your payment app."
          onSubmitReference={async (txn) => {
            await submitPaymentReference(pendingOrder.orderNumber, txn);
          }}
          onSuccess={() => finish(pendingOrder)}
        />
      )}
    </div>
  );
}
