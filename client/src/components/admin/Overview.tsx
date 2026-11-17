import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, PackageX, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatSlot } from "@shared/booking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi, BOOKING_STATUS, ORDER_STATUS, type AdminStats } from "@/lib/admin";
import { formatCurrency } from "@/lib/format";
import { Empty, StatusPill, formatDay } from "./shared";

export type Jump = (tab: "orders" | "bookings" | "inventory", filter?: Record<string, string>) => void;

function Stat({ label, value, change, hint }: { label: string; value: string; change?: number | null; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {change != null && (
          <span className="inline-flex items-center font-medium text-foreground">
            {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(change)}%
          </span>
        )}
        {hint ?? (change != null ? "vs previous 30 days" : "last 30 days")}
      </p>
    </Card>
  );
}

function SalesChart({ data }: { data: AdminStats["daily"] }) {
  const total = data.reduce((s, d) => s + d.revenue, 0);
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="font-medium">Daily sales, last 14 days</h3>
        <span className="text-sm text-muted-foreground tabular-nums">{formatCurrency(total)}</span>
      </div>
      {total === 0 ? (
        <Empty>No sales in the last 14 days yet.</Empty>
      ) : (
        <div className="h-64" role="img" aria-label={`Daily sales for the last 14 days, ${formatCurrency(total)} in total`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => new Date(`${d}T00:00:00`).getDate().toString()}
                tickLine={false}
                axisLine={false}
                fontSize={12}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tickFormatter={(v: number) => (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)}
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={48}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as AdminStats["daily"][number];
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                      <p className="font-medium">{formatDay(p.date)}</p>
                      <p className="mt-1 tabular-nums">{formatCurrency(p.revenue)}</p>
                      <p className="text-muted-foreground">
                        {p.orders} order{p.orders === 1 ? "" : "s"} · {p.bookings} booking{p.bookings === 1 ? "" : "s"}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="revenue" fill="var(--chart-sales)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

export function Overview({ onJump }: { onJump: Jump }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: adminApi.stats,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
        <Skeleton className="h-72 sm:col-span-2 lg:col-span-4" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Empty>
        Couldn't load the dashboard. {(error as Error)?.message}{" "}
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </Empty>
    );
  }

  const toVerify = data.toVerify.orders + data.toVerify.bookings;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Updated {new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {(toVerify > 0 || data.lowStock.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {toVerify > 0 && (
            <Card className="flex items-center justify-between gap-4 border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
                <div>
                  <p className="font-medium">UPI payments to verify</p>
                  <p className="text-sm text-muted-foreground">
                    {data.toVerify.orders} order{data.toVerify.orders === 1 ? "" : "s"}, {data.toVerify.bookings} booking
                    {data.toVerify.bookings === 1 ? "" : "s"}. Check each reference against your bank statement.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {data.toVerify.orders > 0 && (
                  <Button size="sm" variant="outline" onClick={() => onJump("orders", { payment: "verification_pending" })}>
                    Orders
                  </Button>
                )}
                {data.toVerify.bookings > 0 && (
                  <Button size="sm" variant="outline" onClick={() => onJump("bookings", { payment: "verification_pending" })}>
                    Bookings
                  </Button>
                )}
              </div>
            </Card>
          )}
          {data.lowStock.length > 0 && (
            <Card className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-start gap-3">
                <PackageX className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">Running low</p>
                  <p className="text-sm text-muted-foreground">
                    {data.lowStock
                      .slice(0, 3)
                      .map((p) => `${p.name} (${p.stock})`)
                      .join(", ")}
                    {data.lowStock.length > 3 && ` and ${data.lowStock.length - 3} more`}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => onJump("inventory")}>
                Restock
              </Button>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sales" value={formatCurrency(data.sales.last30)} change={data.sales.change} />
        <Stat label="Orders" value={String(data.orders.last30)} change={data.orders.change} />
        <Stat label="Appointments" value={String(data.bookings.last30)} change={data.bookings.change} />
        <Stat label="Average order" value={formatCurrency(data.orders.averageValue)} hint="last 30 days" />
      </div>

      <SalesChart data={data.daily} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-medium">
              <CalendarClock className="h-4 w-4 text-muted-foreground" /> Today's appointments
            </h3>
            <Button variant="ghost" size="sm" onClick={() => onJump("bookings", { date: data.today })}>
              View all
            </Button>
          </div>
          {data.bookings.today.length === 0 ? (
            <Empty>No appointments today.</Empty>
          ) : (
            <ul className="divide-y">
              {data.bookings.today.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="w-16 shrink-0 font-medium tabular-nums sm:w-20">{formatSlot(b.time)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{b.customer.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {b.serviceName} with {b.stylistName}
                    </span>
                  </span>
                  <StatusPill status={b.status} label={BOOKING_STATUS[b.status]} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 p-5">
          <h3 className="mb-3 font-medium">Pipeline</h3>
          <div className="grid gap-6 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Orders</p>
              <ul className="space-y-1.5">
                {(Object.keys(ORDER_STATUS) as (keyof typeof ORDER_STATUS)[]).map((s) => (
                  <li key={s}>
                    <button className="flex w-full justify-between hover:text-primary" onClick={() => onJump("orders", { status: s })}>
                      <span>{ORDER_STATUS[s]}</span>
                      <span className="tabular-nums">{data.orders.byStatus[s]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Appointments</p>
              <ul className="space-y-1.5">
                {(Object.keys(BOOKING_STATUS) as (keyof typeof BOOKING_STATUS)[]).map((s) => (
                  <li key={s}>
                    <button className="flex w-full justify-between hover:text-primary" onClick={() => onJump("bookings", { status: s })}>
                      <span>{BOOKING_STATUS[s]}</span>
                      <span className="tabular-nums">{data.bookings.byStatus[s]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
