import { useEffect, useState } from "react";
import { Loader2, MapPin, Truck } from "lucide-react";
import type { DeliveryEstimate } from "@shared/pricing";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatShortDate } from "@/lib/format";

export type DeliveryInfo = DeliveryEstimate & { earliest: string; latest: string };

const PIN_KEY = "gg_pincode";

export function readSavedPincode(): string {
  try {
    return localStorage.getItem(PIN_KEY) || "";
  } catch {
    return "";
  }
}

/** Looks up delivery dates for a PIN code; remembers the last valid one. */
export function useDeliveryEstimate(pincode: string) {
  const [info, setInfo] = useState<DeliveryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(null);
    if (!/^[1-9]\d{5}$/.test(pincode)) {
      setInfo(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    api<DeliveryInfo>(`/api/delivery/${pincode}`, { signal: ctrl.signal })
      .then((d) => {
        setInfo(d);
        try {
          localStorage.setItem(PIN_KEY, pincode);
        } catch {
          /* ignore */
        }
      })
      .catch((e) => {
        if (e?.name !== "AbortError") {
          setInfo(null);
          setError(e?.message ?? "Couldn't check this PIN code");
        }
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [pincode]);

  return { info, error, loading };
}

export function DeliveryCheck() {
  const [draft, setDraft] = useState(readSavedPincode);
  const [pincode, setPincode] = useState(readSavedPincode);
  const [touched, setTouched] = useState(false);
  const { info, error, loading } = useDeliveryEstimate(pincode);
  const invalid = touched && draft.length > 0 && !/^[1-9]\d{5}$/.test(draft);

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="delivery-heading">
      <h2 id="delivery-heading" className="flex items-center gap-2 text-sm font-semibold">
        <MapPin className="h-4 w-4 text-primary" /> Delivery
      </h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          setPincode(draft);
        }}
      >
        <Input
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="Enter PIN code"
          aria-label="PIN code"
          aria-invalid={invalid || undefined}
          maxLength={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          className="h-10 font-mono tracking-wider"
        />
        <Button type="submit" variant="outline" className="h-10 shrink-0 px-4" disabled={loading || draft.length !== 6}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
        </Button>
      </form>

      <div className="mt-3 min-h-[2.5rem] text-sm" aria-live="polite">
        {invalid ? (
          <p className="text-destructive">Enter a valid 6-digit PIN code.</p>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : info ? (
          <div className="flex gap-2.5">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p>
                Delivery by <span className="font-semibold">{formatShortDate(info.latest)}</span>
                {info.zone === "local" && <span className="text-muted-foreground"> · from our Miyapur studio</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {info.codAvailable ? "Cash on delivery available" : "Prepaid (UPI) orders only for this PIN code"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Check delivery dates and cash-on-delivery for your area.</p>
        )}
      </div>
    </section>
  );
}
