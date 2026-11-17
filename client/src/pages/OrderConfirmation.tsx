import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { CheckCircle2, Clock, Gift, Loader2, MapPin, PackageX, Truck } from "lucide-react";
import type { OrderView } from "@shared/checkout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import QRPayment from "@/components/QRPayment";
import { CheckoutSteps } from "@/components/cart/CheckoutSteps";
import { getShopProduct } from "@/lib/catalog";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, cancelOrder, fetchOrder, submitPaymentReference } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/ProductImage";

const card = "rounded-xl border bg-card";

export default function OrderConfirmation() {
  const [, params] = useRoute("/order/:orderNumber");
  const orderNumber = params?.orderNumber ?? "";
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const ctrl = new AbortController();
    fetchOrder(orderNumber, ctrl.signal)
      .then(setOrder)
      .catch((e) => e?.name !== "AbortError" && setError(e?.message ?? "Couldn't load this order"));
    return () => ctrl.abort();
  }, [orderNumber]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <PackageX className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">We couldn't find that order</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error} If you placed it on another device, sign in to see it, or contact us with your order number.
        </p>
        <Button asChild className="mt-6">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cancelled = order.status === "cancelled";
  const awaitingPayment = order.status === "pending_payment";
  const cancellable = order.status === "pending_payment" || order.status === "placed";
  const a = order.shippingAddress;

  const doCancel = async () => {
    if (!window.confirm("Cancel this order?")) return;
    setCancelling(true);
    try {
      setOrder(await cancelOrder(order.orderNumber));
      toast({ title: "Order cancelled" });
    } catch (e: any) {
      toast({ title: "Couldn't cancel", description: e?.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30 pb-16">
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6">
          <p className="text-sm text-muted-foreground">
            Order <span className="font-mono font-semibold text-foreground">{order.orderNumber}</span>
          </p>
          <CheckoutSteps current={awaitingPayment ? 1 : 2} />
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 lg:py-8">
        <section className={cn(card, "p-6 text-center sm:p-8")}>
          <span
            className={cn(
              "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
              cancelled ? "bg-muted text-muted-foreground" : awaitingPayment ? "bg-secondary/15 text-secondary" : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
            )}
          >
            {cancelled ? <PackageX className="h-7 w-7" /> : awaitingPayment ? <Clock className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
          </span>
          <h1 className="mt-4 font-serif text-2xl font-semibold sm:text-3xl">
            {cancelled ? "This order was cancelled" : awaitingPayment ? "Almost there" : "Thank you for your order"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {cancelled
              ? "Nothing more to do. If you already paid, we'll refund you within 5–7 business days."
              : awaitingPayment
                ? "Complete your UPI payment to confirm this order. We'll hold your items for 30 minutes."
                : `We've sent a confirmation to ${order.email}.`}
          </p>
          {!cancelled && !awaitingPayment && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-sm">
              <Truck className="h-4 w-4" /> Arrives by <span className="font-semibold">{formatShortDate(order.delivery.estimatedBy)}</span>
            </p>
          )}
          {awaitingPayment && (
            <Button className="mt-5 h-11 px-8" onClick={() => setShowQR(true)}>
              Pay {formatCurrency(order.pricing.total)} with UPI
            </Button>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
          <section className={card} aria-label="Items">
            <ul className="divide-y">
              {order.items.map((it) => (
                <li key={it.productId} className="flex items-center gap-4 p-4">
                  <ProductImage src={getShopProduct(it.productId)?.image ?? ""} alt="" className="h-14 w-14 shrink-0 rounded-md border" imgClassName="p-1" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.size} · Qty {it.quantity}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">{formatCurrency(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-2 border-t p-4 text-sm">
              {order.pricing.mrpDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount on MRP</dt>
                  <dd className="text-green-700 dark:text-green-400">− {formatCurrency(order.pricing.mrpDiscount)}</dd>
                </div>
              )}
              {order.pricing.couponDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Coupon {order.pricing.couponCode}</dt>
                  <dd className="text-green-700 dark:text-green-400">− {formatCurrency(order.pricing.couponDiscount)}</dd>
                </div>
              )}
              {order.pricing.giftWrapFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Gift wrap</dt>
                  <dd>{formatCurrency(order.pricing.giftWrapFee)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd>{order.pricing.shippingFee ? formatCurrency(order.pricing.shippingFee) : "Free"}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCurrency(order.pricing.total)}</dd>
              </div>
            </dl>
          </section>

          <div className="space-y-4">
            <section className={cn(card, "space-y-3 p-4 text-sm")}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                <p className="mt-1 font-medium">{ORDER_STATUS_LABEL[order.status]}</p>
                <p className="text-xs text-muted-foreground">{PAYMENT_STATUS_LABEL[order.payment.status] ?? order.payment.status}</p>
              </div>
              <div className="border-t pt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> Delivering to
                </p>
                <p className="mt-1 font-medium">{a.name}</p>
                <p className="text-muted-foreground">
                  {a.line1}, {a.locality}, {a.city}, {a.state} {a.pincode}
                </p>
                <p className="text-muted-foreground">+91 {a.phone}</p>
              </div>
              {order.gift.wrap && (
                <div className="border-t pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Gift className="h-3.5 w-3.5" /> Gift wrapped
                  </p>
                  {order.gift.message && <p className="mt-1 italic text-muted-foreground">“{order.gift.message}”</p>}
                </div>
              )}
            </section>
            <Button asChild variant="outline" className="w-full">
              <Link href="/products">Continue shopping</Link>
            </Button>
            {cancellable && (
              <Button variant="ghost" className="w-full text-muted-foreground hover:text-destructive" onClick={doCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel order"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {order.payment.method === "upi" && (
        <QRPayment
          isOpen={showQR}
          onClose={() => setShowQR(false)}
          amount={order.pricing.total}
          reference={order.orderNumber}
          upiLink={order.payment.upiLink}
          title="Pay with UPI"
          description="Scan with any UPI app, then enter the reference number from your payment app."
          onSubmitReference={async (txn) => {
            setOrder(await submitPaymentReference(order.orderNumber, txn));
          }}
          onSuccess={() => setShowQR(false)}
        />
      )}
    </div>
  );
}
