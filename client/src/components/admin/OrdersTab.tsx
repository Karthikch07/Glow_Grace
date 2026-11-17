import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { OrderView } from "@shared/checkout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { adminApi, ORDER_NEXT, ORDER_STATUS, PAYMENT_STATUS } from "@/lib/admin";
import { formatCurrency } from "@/lib/format";
import { Empty, Pager, StatusPill, formatDateTime, useAdminMutation, useDebounced } from "./shared";

const ACTION_LABEL: Partial<Record<OrderView["status"], string>> = {
  placed: "Mark as placed",
  confirmed: "Confirm order",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
};

function OrderDetail({ order, onClose }: { order: OrderView; onClose: () => void }) {
  const [note, setNote] = useState("");
  const update = useAdminMutation(
    (body: { status?: string; paymentStatus?: string }) => adminApi.updateOrder(order.orderNumber, { ...body, note: note.trim() || undefined }),
    (o) => `${o.orderNumber}: ${ORDER_STATUS[o.status]}, ${PAYMENT_STATUS[o.payment.status] ?? o.payment.status}`,
  );
  const a = order.shippingAddress;
  const canVerify = order.payment.method === "upi" && order.payment.status === "verification_pending" && order.status !== "cancelled";

  const run = (body: { status?: string; paymentStatus?: string }, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    update.mutate(body, { onSuccess: () => setNote("") });
  };

  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap gap-2">
        <StatusPill status={order.status} label={ORDER_STATUS[order.status]} />
        <StatusPill status={order.payment.status} label={PAYMENT_STATUS[order.payment.status] ?? order.payment.status} />
      </div>

      {canVerify && (
        <Card className="space-y-3 border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <p>
            Customer paid by UPI with reference <span className="font-mono font-semibold">{order.payment.transactionId}</span>. Match it against
            a credit of <strong>{formatCurrency(order.pricing.total)}</strong> in your bank statement.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={update.isPending} onClick={() => run({ paymentStatus: "paid", status: order.status === "placed" ? "confirmed" : undefined })}>
              Payment received
            </Button>
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => run({ paymentStatus: "failed" }, "Mark this payment as not received?")}>
              Not received
            </Button>
          </div>
        </Card>
      )}

      <section>
        <h4 className="mb-2 font-medium">Items</h4>
        <ul className="divide-y rounded-md border">
          {order.items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-3 p-3">
              <span>
                {i.name} <span className="text-muted-foreground">× {i.quantity}</span>
              </span>
              <span className="tabular-nums">{formatCurrency(i.lineTotal)}</span>
            </li>
          ))}
          {order.pricing.couponDiscount > 0 && (
            <li className="flex justify-between p-3 text-muted-foreground">
              <span>Coupon {order.pricing.couponCode}</span>
              <span className="tabular-nums">−{formatCurrency(order.pricing.couponDiscount)}</span>
            </li>
          )}
          {order.pricing.shippingFee + order.pricing.giftWrapFee > 0 && (
            <li className="flex justify-between p-3 text-muted-foreground">
              <span>Shipping & gift wrap</span>
              <span className="tabular-nums">{formatCurrency(order.pricing.shippingFee + order.pricing.giftWrapFee)}</span>
            </li>
          )}
          <li className="flex justify-between p-3 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(order.pricing.total)}</span>
          </li>
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-1 font-medium">Ship to</h4>
          <p className="text-muted-foreground">
            {a.name}
            <br />
            {a.line1}, {a.locality}
            <br />
            {a.city}, {a.state} {a.pincode}
            <br />
            {a.phone}
          </p>
        </div>
        <div>
          <h4 className="mb-1 font-medium">Contact</h4>
          <p className="break-all text-muted-foreground">{order.email}</p>
          {order.gift.wrap && (
            <p className="mt-2 text-muted-foreground">
              Gift wrap{order.gift.message && <>: “{order.gift.message}”</>}
            </p>
          )}
        </div>
      </section>

      {ORDER_NEXT[order.status].length > 0 && (
        <section className="space-y-2">
          <h4 className="font-medium">Update order</h4>
          <Textarea rows={2} maxLength={500} placeholder="Note for the order history (optional), e.g. courier and tracking number" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {ORDER_NEXT[order.status].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === "cancelled" ? "outline" : "default"}
                className={s === "cancelled" ? "text-destructive" : undefined}
                disabled={update.isPending}
                onClick={() => run({ status: s }, s === "cancelled" ? `Cancel ${order.orderNumber}? Reserved stock goes back on sale.` : undefined)}
              >
                {ACTION_LABEL[s]}
              </Button>
            ))}
          </div>
        </section>
      )}

      {order.payment.status === "paid" && order.status === "cancelled" && (
        <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => run({ paymentStatus: "refunded" }, "Record that this payment was refunded?")}>
          Record refund
        </Button>
      )}

      <section>
        <h4 className="mb-2 font-medium">History</h4>
        <ol className="space-y-2 border-l pl-4">
          {[...order.history].reverse().map((h, i) => (
            <li key={i}>
              <p>
                {ORDER_STATUS[h.status as OrderView["status"]] ?? h.status}
                {h.note && <span className="text-muted-foreground"> · {h.note}</span>}
              </p>
              <p className="text-xs text-muted-foreground">{formatDateTime(h.at)}</p>
            </li>
          ))}
        </ol>
      </section>

      <Button variant="ghost" className="w-full" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

export function OrdersTab({ initial }: { initial?: Record<string, string> }) {
  const [status, setStatus] = useState(initial?.status ?? "all");
  const [payment, setPayment] = useState(initial?.payment ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounced(search);

  useEffect(() => {
    setStatus(initial?.status ?? "all");
    setPayment(initial?.payment ?? "");
  }, [initial]);
  useEffect(() => setPage(1), [status, payment, q]);

  const params = { status: status === "all" ? undefined : status, payment: payment || undefined, q: q || undefined, page };
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "orders", params],
    queryFn: () => adminApi.orders(params),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const open = data?.items.find((o) => o.orderNumber === openId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search order number, email, name, phone or UPI reference" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(ORDER_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant={payment ? "default" : "outline"} onClick={() => setPayment(payment ? "" : "verification_pending")}>
          Payments to verify
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <Empty>Couldn't load orders. {(error as Error).message}</Empty>
      ) : !data || data.items.length === 0 ? (
        <Empty>No orders match these filters.</Empty>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead className="hidden sm:table-cell">Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenId(o.orderNumber)}>
                  <TableCell>
                    <span className="block font-mono text-xs font-semibold">{o.orderNumber}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="block">{o.shippingAddress.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.items.reduce((s, i) => s + i.quantity, 0)} item{o.items.reduce((s, i) => s + i.quantity, 0) === 1 ? "" : "s"} · {o.shippingAddress.city}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(o.pricing.total)}</TableCell>
                  <TableCell>
                    <StatusPill status={o.payment.status} label={PAYMENT_STATUS[o.payment.status] ?? o.payment.status} />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={o.status} label={ORDER_STATUS[o.status]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}

      <Sheet open={Boolean(open)} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="font-mono">{open.orderNumber}</SheetTitle>
                <p className="text-sm text-muted-foreground">Placed {formatDateTime(open.createdAt)}</p>
              </SheetHeader>
              <OrderDetail order={open} onClose={() => setOpenId(null)} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
