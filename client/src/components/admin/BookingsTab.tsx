import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { formatSlot, type BookingView } from "@shared/booking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, BOOKING_NEXT, BOOKING_STATUS, PAYMENT_STATUS } from "@/lib/admin";
import { formatCurrency } from "@/lib/format";
import { Empty, Pager, StatusPill, formatDateTime, formatDay, useAdminMutation, useDebounced } from "./shared";

const ACTION_LABEL: Partial<Record<BookingView["status"], string>> = {
  confirmed: "Confirm",
  completed: "Mark completed",
  cancelled: "Cancel appointment",
};

function BookingDetail({ booking }: { booking: BookingView }) {
  const update = useAdminMutation(
    (body: { status?: string; paymentStatus?: string }) => adminApi.updateBooking(booking.bookingNumber, body),
    (b) => `${b.bookingNumber}: ${BOOKING_STATUS[b.status]}`,
  );
  const run = (body: { status?: string; paymentStatus?: string }, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    update.mutate(body);
  };
  const canVerify = booking.payment.status === "verification_pending" && booking.status !== "cancelled";
  const canTakeCash = booking.payment.status === "pay_at_salon" && booking.status !== "cancelled";

  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap gap-2">
        <StatusPill status={booking.status} label={BOOKING_STATUS[booking.status]} />
        <StatusPill status={booking.payment.status} label={PAYMENT_STATUS[booking.payment.status] ?? booking.payment.status} />
      </div>

      <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
        <dt className="text-muted-foreground">When</dt>
        <dd>
          {formatDay(booking.date)}, {formatSlot(booking.time)} · {booking.durationMin} min
        </dd>
        <dt className="text-muted-foreground">Service</dt>
        <dd>{booking.serviceName}</dd>
        <dt className="text-muted-foreground">Stylist</dt>
        <dd>{booking.stylistName}</dd>
        <dt className="text-muted-foreground">Price</dt>
        <dd className="tabular-nums">{formatCurrency(booking.price)}</dd>
        <dt className="text-muted-foreground">Customer</dt>
        <dd>
          {booking.customer.name}
          <br />
          <a className="text-primary hover:underline" href={`tel:${booking.customer.phone}`}>
            {booking.customer.phone}
          </a>
          <br />
          <span className="break-all text-muted-foreground">{booking.customer.email}</span>
        </dd>
        {booking.notes && (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd>{booking.notes}</dd>
          </>
        )}
      </dl>

      {canVerify && (
        <Card className="space-y-3 border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <p>
            UPI reference <span className="font-mono font-semibold">{booking.payment.transactionId}</span>. Match it against a credit of{" "}
            <strong>{formatCurrency(booking.price)}</strong>.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={update.isPending} onClick={() => run({ paymentStatus: "paid" })}>
              Payment received
            </Button>
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => run({ paymentStatus: "failed" }, "Mark this payment as not received?")}>
              Not received
            </Button>
          </div>
        </Card>
      )}

      {canTakeCash && (
        <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => run({ paymentStatus: "paid" })}>
          Record payment at salon
        </Button>
      )}

      {BOOKING_NEXT[booking.status].length > 0 && (
        <div className="flex flex-wrap gap-2">
          {BOOKING_NEXT[booking.status].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "cancelled" ? "outline" : "default"}
              className={s === "cancelled" ? "text-destructive" : undefined}
              disabled={update.isPending}
              onClick={() => run({ status: s }, s === "cancelled" ? `Cancel ${booking.bookingNumber}? The slot opens up for other customers.` : undefined)}
            >
              {ACTION_LABEL[s]}
            </Button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">Booked {formatDateTime(booking.createdAt)}</p>
    </div>
  );
}

export function BookingsTab({ initial }: { initial?: Record<string, string> }) {
  const [status, setStatus] = useState(initial?.status ?? "all");
  const [payment, setPayment] = useState(initial?.payment ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounced(search);

  useEffect(() => {
    setStatus(initial?.status ?? "all");
    setPayment(initial?.payment ?? "");
    setDate(initial?.date ?? "");
  }, [initial]);
  useEffect(() => setPage(1), [status, payment, date, q]);

  const params = { status: status === "all" ? undefined : status, payment: payment || undefined, date: date || undefined, q: q || undefined, page };
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "bookings", params],
    queryFn: () => adminApi.bookings(params),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const open = data?.items.find((b) => b.bookingNumber === openId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search booking number, name, phone, email or UPI reference" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Appointment date" />
            {date && (
              <button className="absolute right-9 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setDate("")} aria-label="Clear date">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(BOOKING_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant={payment ? "default" : "outline"} onClick={() => setPayment(payment ? "" : "verification_pending")}>
          Payments to verify
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <Empty>Couldn't load appointments. {(error as Error).message}</Empty>
      ) : !data || data.items.length === 0 ? (
        <Empty>No appointments match these filters.</Empty>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Service</TableHead>
                <TableHead className="hidden sm:table-cell">Payment</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => setOpenId(b.bookingNumber)}>
                  <TableCell>
                    <span className="block whitespace-nowrap">{formatDay(b.date)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatSlot(b.time)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="block">{b.customer.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{b.bookingNumber}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="block">{b.serviceName}</span>
                    <span className="text-xs text-muted-foreground">{b.stylistName}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusPill status={b.payment.status} label={PAYMENT_STATUS[b.payment.status] ?? b.payment.status} />
                  </TableCell>
                  <TableCell>
                    <StatusPill status={b.status} label={BOOKING_STATUS[b.status]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}

      <Sheet open={Boolean(open)} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="font-mono">{open.bookingNumber}</SheetTitle>
              </SheetHeader>
              <BookingDetail booking={open} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
