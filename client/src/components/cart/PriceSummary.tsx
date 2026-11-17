import type { ReactNode } from "react";
import type { Quote } from "@shared/pricing";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

function Row({ label, value, tone, hint }: { label: ReactNode; value: ReactNode; tone?: "save" | "muted"; hint?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">
        {label}
        {hint && <div className="mt-0.5 text-xs text-muted-foreground/80">{hint}</div>}
      </dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          tone === "save" ? "font-medium text-green-700 dark:text-green-400" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** The price breakdown used on both the cart and checkout pages. */
export function PriceSummary({ quote, children }: { quote: Quote; children?: ReactNode }) {
  const couponApplied = quote.coupon.status === "applied";
  return (
    <div className="space-y-4">
      <dl className="space-y-3">
        <Row label={`Price (${quote.itemCount} ${quote.itemCount === 1 ? "item" : "items"})`} value={formatCurrency(quote.mrpTotal)} />
        {quote.mrpDiscount > 0 && <Row label="Discount on MRP" value={`− ${formatCurrency(quote.mrpDiscount)}`} tone="save" />}
        {couponApplied && (
          <Row
            label={
              <>
                Coupon <span className="font-mono text-xs font-semibold text-foreground">{quote.coupon.status === "applied" && quote.coupon.code}</span>
              </>
            }
            value={`− ${formatCurrency(quote.couponDiscount)}`}
            tone="save"
          />
        )}
        {quote.giftWrap && <Row label="Gift wrap" value={formatCurrency(quote.giftWrapFee)} />}
        <Row
          label="Delivery"
          value={
            quote.shippingFee === 0 ? (
              <span className="font-medium text-green-700 dark:text-green-400">Free</span>
            ) : (
              formatCurrency(quote.shippingFee)
            )
          }
          hint={quote.freeShippingRemaining > 0 ? `Free over ${formatCurrency(quote.subtotal + quote.freeShippingRemaining)}` : undefined}
        />
      </dl>

      <div className="flex items-baseline justify-between border-t border-dashed pt-4">
        <span className="font-semibold">Total</span>
        <span className="text-xl font-semibold tabular-nums">{formatCurrency(quote.total)}</span>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Inclusive of all taxes</p>

      {quote.totalSavings > 0 && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-center text-sm font-medium text-green-800 dark:bg-green-950/40 dark:text-green-300">
          You're saving {formatCurrency(quote.totalSavings)} on this order
        </div>
      )}
      {children}
    </div>
  );
}
