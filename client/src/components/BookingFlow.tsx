import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Banknote, Calendar, CheckCircle2, Clock, Loader2, QrCode, Star, User } from "lucide-react";
import {
  STYLISTS,
  SLOT_TIMES,
  bookableDates,
  bookingInputSchema,
  findService,
  findStylist,
  formatSlot,
  type Availability,
  type BookingPaymentMethod,
  type BookingView,
} from "@shared/booking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import QRPayment from "@/components/QRPayment";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cancelBooking, createBooking, fetchAvailability, submitBookingPayment } from "@/lib/bookings";
import { allServices } from "@/lib/catalog";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, name: "Select Service", icon: User },
  { id: 2, name: "Choose Time", icon: Clock },
  { id: 3, name: "Your Details", icon: Calendar },
  { id: 4, name: "Confirm", icon: CheckCircle2 },
] as const;

const card = "rounded-md border bg-card";

function formatDateLong(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Service id from ?serviceId=… or from the "Book now" button on a service card. */
function readPreselectedService(): number | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("serviceId");
    const fromSession = sessionStorage.getItem("preselectedServiceId");
    sessionStorage.removeItem("preselectedServiceId");
    for (const raw of [fromUrl, fromSession]) {
      const svc = raw ? findService(raw) ?? allServices.find((s) => s.name === raw) : undefined;
      if (svc) return svc.id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function StepHeader({ current }: { current: number }) {
  return (
    <div className="flex justify-between items-center">
      {STEPS.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={cn(
                "flex items-center justify-center w-12 h-12 rounded-full border-2 transition-colors",
                current >= step.id
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground/30 text-muted-foreground"
              )}
            >
              <step.icon className="h-5 w-5" />
            </div>
            <span className="text-sm mt-2 font-medium text-center">{step.name}</span>
          </div>
          {index < STEPS.length - 1 && (
            <div className={cn("h-[2px] flex-1 mx-2 transition-colors", current > step.id ? "bg-primary" : "bg-muted-foreground/30")} />
          )}
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h4 className="font-medium">{children}</h4>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function BookingFlow() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<number | null>(() => readPreselectedService());
  const [date, setDate] = useState<string | null>(null);
  const [stylistId, setStylistId] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [details, setDetails] = useState({ name: user?.displayName || "", phone: user?.phoneNumber || "", email: user?.email || "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [payment, setPayment] = useState<BookingPaymentMethod>("upi");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [showQR, setShowQR] = useState(false);
  const idempotency = useRef(newKey());

  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [availTick, setAvailTick] = useState(0);

  const service = findService(serviceId);
  const stylist = findStylist(stylistId);
  const dates = useMemo(() => bookableDates().slice(0, 14), []);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDetails((d) => ({
      name: d.name || user?.displayName || "",
      phone: d.phone || user?.phoneNumber || "",
      email: d.email || user?.email || "",
      notes: d.notes,
    }));
  }, [user?.displayName, user?.phoneNumber, user?.email]);

  // Load slot availability whenever the date changes (and on request).
  useEffect(() => {
    if (!date) return setAvailability(null);
    const ctrl = new AbortController();
    setAvailLoading(true);
    setAvailError(null);
    fetchAvailability(date, ctrl.signal)
      .then(setAvailability)
      .catch((e) => e?.name !== "AbortError" && setAvailError(e?.message ?? "Couldn't load time slots"))
      .finally(() => setAvailLoading(false));
    return () => ctrl.abort();
  }, [date, availTick]);

  const isClosed = (t: string) => !availability || availability.closed.includes(t);
  const isTakenFor = (t: string, sId: number | null) => (sId != null ? (availability?.taken[t] ?? []).includes(sId) : (availability?.taken[t]?.length ?? 0) >= STYLISTS.length);
  const slotFree = (t: string) => !isClosed(t) && !isTakenFor(t, stylistId);
  const freeCount = availability ? SLOT_TIMES.filter(slotFree).length : 0;

  // Drop a chosen time that stopped being available (new date, new stylist, or someone else booked it).
  useEffect(() => {
    if (time && availability && !slotFree(time)) setTime(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, stylistId]);

  const goTo = (n: number) => {
    setStep(n);
    setFormError(null);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const step2Ready = Boolean(date && stylist && time && availability && slotFree(time));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!service || !step2Ready) return goTo(service ? 2 : 1);

    const input = {
      serviceId: service.id,
      stylistId: stylist!.id,
      date: date!,
      time: time as (typeof SLOT_TIMES)[number],
      customer: { name: details.name, phone: details.phone, email: details.email },
      notes: details.notes,
      paymentMethod: payment,
      idempotencyKey: idempotency.current,
    };
    const parsed = bookingInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[i.path.length - 1])] ??= i.message;
      setErrors(next);
      document.getElementById(`bk-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const created = await createBooking(input);
      setBooking(created);
      if (created.payment.method === "upi" && created.status === "pending_payment") setShowQR(true);
      else goTo(4);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
        // Slot was taken or has passed: send the customer back to pick another.
        toast({ title: "Please pick another time", description: msg, variant: "destructive" });
        setTime(null);
        setAvailTick((n) => n + 1);
        idempotency.current = newKey();
        goTo(2);
      } else {
        setFormError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    setBooking(null);
    setServiceId(null);
    setDate(null);
    setStylistId(null);
    setTime(null);
    setDetails((d) => ({ ...d, notes: "" }));
    idempotency.current = newKey();
    goTo(1);
  };

  const doCancel = async () => {
    if (!booking || !window.confirm("Cancel this appointment?")) return;
    try {
      setBooking(await cancelBooking(booking.bookingNumber));
      setAvailTick((n) => n + 1);
      toast({ title: "Appointment cancelled" });
    } catch (e: any) {
      toast({ title: "Couldn't cancel", description: e?.message, variant: "destructive" });
    }
  };

  const summary = service && (
    <div className={cn(card, "space-y-2 p-4 text-sm")}>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Service</span>
        <span className="text-right font-medium">{service.name}</span>
      </div>
      {date && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Date</span>
          <span className="text-right font-medium">{formatDateLong(date)}</span>
        </div>
      )}
      {time && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Time</span>
          <span className="text-right font-medium">
            {formatSlot(time)} · {service.durationMin} min
          </span>
        </div>
      )}
      {stylist && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Stylist</span>
          <span className="text-right font-medium">{stylist.name}</span>
        </div>
      )}
      <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatCurrency(service.price)}</span>
      </div>
    </div>
  );

  return (
    <div ref={topRef} className="scroll-mt-24 space-y-8">
      <StepHeader current={step} />

      <Card className="p-6">
        {/* ---------------- Step 1: service ---------------- */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-serif text-2xl font-semibold">Select a Service</h3>
            <div className="grid gap-3" role="radiogroup" aria-label="Service">
              {allServices.map((s) => {
                const selected = serviceId === s.id;
                return (
                  <Card
                    key={s.id}
                    role="radio"
                    tabIndex={0}
                    aria-checked={selected}
                    onClick={() => setServiceId(s.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setServiceId(s.id))}
                    className={cn("p-4 cursor-pointer hover-elevate transition-colors", selected && "ring-2 ring-primary")}
                    data-testid={`card-service-option-${s.id}`}
                  >
                    <div className="flex justify-between items-center gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <img src={s.image} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                        <div className="min-w-0">
                          <h4 className="font-medium truncate">{s.name}</h4>
                          <p className="text-sm text-muted-foreground">{s.duration}</p>
                        </div>
                      </div>
                      <div className="text-lg font-semibold">{formatCurrency(Number(s.price))}</div>
                    </div>
                  </Card>
                );
              })}
            </div>
            <Button className="h-11 w-full" disabled={!service} onClick={() => service && goTo(2)} data-testid="button-next-step">
              Continue
            </Button>
          </div>
        )}

        {/* ---------------- Step 2: date, stylist, time ---------------- */}
        {step === 2 && service && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Selected service</p>
                <p className="truncate font-medium">
                  {service.name} · {service.durationMin} min · {formatCurrency(service.price)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => goTo(1)} data-testid="button-change-service">
                Change
              </Button>
            </div>

            <section>
              <SectionTitle>Select Date</SectionTitle>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="radiogroup" aria-label="Date">
                {dates.map((d, i) => {
                  const dt = new Date(`${d}T00:00:00`);
                  const selected = date === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDate(d)}
                      className={cn(
                        "flex w-16 shrink-0 flex-col items-center rounded-lg border py-2 transition-colors",
                        selected ? "border-primary bg-primary text-primary-foreground" : "hover:border-foreground/30",
                      )}
                      data-testid={`button-date-${d}`}
                    >
                      <span className={cn("text-[11px] font-medium uppercase", !selected && "text-muted-foreground")}>
                        {i === 0 ? "Today" : dt.toLocaleDateString("en-IN", { weekday: "short" })}
                      </span>
                      <span className="text-lg font-semibold leading-tight">{dt.getDate()}</span>
                      <span className={cn("text-[11px]", !selected && "text-muted-foreground")}>{dt.toLocaleDateString("en-IN", { month: "short" })}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <SectionTitle>Choose Stylist</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Stylist">
                {STYLISTS.map((s) => {
                  const selected = stylistId === s.id;
                  const busyAtTime = Boolean(time && availability && isTakenFor(time, s.id));
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setStylistId(s.id)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors",
                        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-foreground/30",
                      )}
                      data-testid={`card-stylist-${s.id}`}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{s.name}</span>
                        <span className="block text-xs text-muted-foreground">{busyAtTime ? `Busy at ${formatSlot(time!)}` : s.specialty}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium">
                        <Star className="h-3 w-3 fill-secondary text-secondary" /> {s.rating.toFixed(1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-live="polite">
              <SectionTitle hint={date && availability && !availLoading ? `${freeCount} of ${SLOT_TIMES.length} available` : undefined}>
                Select Time
              </SectionTitle>
              {!date ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Choose a date to see available times.</p>
              ) : availError ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <span>{availError}</span>
                  <Button size="sm" variant="outline" onClick={() => setAvailTick((n) => n + 1)}>
                    Retry
                  </Button>
                </div>
              ) : availLoading || !availability ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {SLOT_TIMES.map((t) => (
                    <div key={t} className="h-10 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : freeCount === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {stylist ? `${stylist.name} is fully booked on this day. Try another stylist or date.` : "No times left on this day. Please pick another date."}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Time">
                  {SLOT_TIMES.map((t) => {
                    const free = slotFree(t);
                    const selected = time === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={!free}
                        onClick={() => setTime(t)}
                        title={!free ? (isClosed(t) ? "This time has passed" : "Already booked") : undefined}
                        className={cn(
                          "h-10 rounded-md border text-sm font-medium tabular-nums transition-colors",
                          selected && "border-primary bg-primary text-primary-foreground",
                          !selected && free && "hover:border-foreground/30",
                          !free && "cursor-not-allowed bg-muted/50 text-muted-foreground/60 line-through",
                        )}
                        data-testid={`button-time-${t}`}
                      >
                        {formatSlot(t)}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="outline" onClick={() => goTo(1)} className="sm:w-32" data-testid="button-back">
                Back
              </Button>
              <Button
                disabled={!step2Ready}
                onClick={() => step2Ready && goTo(3)}
                className="h-11 flex-1"
                data-testid="button-confirm-booking"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ---------------- Step 3: details & payment ---------------- */}
        {step === 3 && service && (
          <form onSubmit={submit} noValidate className="space-y-6">
            <h3 className="font-serif text-2xl font-semibold">Your Details</h3>
            {formError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
              </div>
            )}
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      { k: "name", label: "Full name", type: "text", auto: "name" },
                      { k: "phone", label: "Mobile number", type: "tel", auto: "tel-national" },
                    ] as const
                  ).map((f) => (
                    <div key={f.k} className="space-y-1.5">
                      <Label htmlFor={`bk-${f.k}`}>
                        {f.label}
                      </Label>
                      <Input
                        id={`bk-${f.k}`}
                        type={f.type}
                        autoComplete={f.auto}
                        value={details[f.k]}
                        onChange={(e) => setDetails({ ...details, [f.k]: e.target.value })}
                        aria-invalid={errors[f.k] ? true : undefined}
                        className={cn("h-11", errors[f.k] && "border-destructive")}
                      />
                      {errors[f.k] && <p className="text-xs text-destructive">{errors[f.k]}</p>}
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bk-email">
                    Email
                  </Label>
                  <Input
                    id="bk-email"
                    type="email"
                    autoComplete="email"
                    value={details.email}
                    onChange={(e) => setDetails({ ...details, email: e.target.value })}
                    aria-invalid={errors.email ? true : undefined}
                    className={cn("h-11", errors.email && "border-destructive")}
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bk-notes">
                    Anything we should know? <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea id="bk-notes" rows={2} maxLength={300} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} className="resize-none" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Payment">
                  {(
                    [
                      { id: "upi", icon: QrCode, title: "Pay now with UPI", body: "Secures your slot instantly" },
                      { id: "salon", icon: Banknote, title: "Pay at the salon", body: "Cash, card or UPI after your visit" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={payment === m.id}
                      onClick={() => setPayment(m.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        payment === m.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-foreground/30",
                      )}
                    >
                      <m.icon className={cn("mt-0.5 h-5 w-5 shrink-0", payment === m.id ? "text-primary" : "text-muted-foreground")} />
                      <span>
                        <span className="block text-sm font-semibold">{m.title}</span>
                        <span className="block text-xs text-muted-foreground">{m.body}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {summary}
                <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => goTo(2)} data-testid="button-edit-booking">
                  Change date or time
                </Button>
              </div>
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={submitting} data-testid="button-confirm-payment">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : payment === "upi" ? `Pay ${formatCurrency(service.price)}` : "Confirm Booking"}
            </Button>
          </form>
        )}

        {/* ---------------- Step 4: confirmed ---------------- */}
        {step === 4 && booking && (
          <div className="space-y-6 text-center">
            <span
              className={cn(
                "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
                booking.status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
              )}
            >
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <div>
              <h3 className="font-serif text-2xl font-semibold">{booking.status === "cancelled" ? "Appointment cancelled" : "You're booked in"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Booking <span className="font-mono font-semibold text-foreground">{booking.bookingNumber}</span>
                {booking.status !== "cancelled" && <> · confirmation sent to {booking.customer.email}</>}
              </p>
            </div>
            <div className="mx-auto max-w-sm text-left">
              <div className={cn(card, "space-y-2 p-4 text-sm")}>
                {[
                  ["Service", booking.serviceName],
                  ["When", `${formatDateLong(booking.date)}, ${formatSlot(booking.time)}`],
                  ["Stylist", booking.stylistName],
                  ["Total", formatCurrency(booking.price)],
                  [
                    "Payment",
                    booking.payment.method === "salon"
                      ? "Pay at the salon"
                      : booking.payment.status === "verification_pending"
                        ? "UPI received, being verified"
                        : booking.payment.status === "paid"
                          ? "Paid"
                          : "Not paid",
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-right font-medium">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">GlowGrace Studio, Miyapur, Hyderabad · please arrive 10 minutes early.</p>
            </div>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <Button onClick={startOver}>Book another appointment</Button>
              <Button asChild variant="outline">
                <Link href="/products">Shop products</Link>
              </Button>
              {booking.status !== "cancelled" && (
                <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={doCancel}>
                  Cancel appointment
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {booking && booking.payment.method === "upi" && (
        <QRPayment
          isOpen={showQR}
          onClose={() => {
            setShowQR(false);
            if (booking.status === "pending_payment") {
              toast({ title: "Slot held for 30 minutes", description: `Complete payment to confirm booking ${booking.bookingNumber}.` });
            }
          }}
          amount={booking.price}
          reference={booking.bookingNumber}
          upiLink={booking.payment.upiLink}
          title="Pay to confirm your booking"
          description="Scan with any UPI app, then enter the reference number from your payment app."
          onSubmitReference={async (txn) => {
            setBooking(await submitBookingPayment(booking.bookingNumber, txn));
          }}
          onSuccess={() => {
            setShowQR(false);
            goTo(4);
          }}
        />
      )}
    </div>
  );
}
