import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Lock } from "lucide-react";
import { ActivityTab } from "@/components/admin/ActivityTab";
import { BookingsTab } from "@/components/admin/BookingsTab";
import { InventoryTab } from "@/components/admin/InventoryTab";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { Overview, type Jump } from "@/components/admin/Overview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminApi } from "@/lib/admin";
import { ApiError, getAuthToken } from "@/lib/api";

type Tab = "overview" | "orders" | "bookings" | "inventory" | "activity";

function Gate({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="container mx-auto px-4 py-24">
      <Card className="mx-auto max-w-md p-8 text-center">
        <Lock className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-muted-foreground">{body}</p>
        {action && <div className="mt-6">{action}</div>}
      </Card>
    </div>
  );
}

export default function Admin() {
  const hasToken = Boolean(getAuthToken());
  // The server decides who is an admin (ADMIN_EMAILS); ask it rather than trusting local state.
  const me = useQuery({ queryKey: ["admin", "session"], queryFn: adminApi.session, enabled: hasToken, staleTime: 60_000 });
  const status = me.error instanceof ApiError ? me.error.status : null;

  const [tab, setTab] = useState<Tab>("overview");
  const [filters, setFilters] = useState<Partial<Record<Tab, Record<string, string>>>>({});

  const jump: Jump = (next, filter) => {
    setFilters((f) => ({ ...f, [next]: filter ?? {} }));
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const signIn = (
    <Button asChild>
      <Link href="/account">Sign in</Link>
    </Button>
  );

  if (!hasToken || status === 401) {
    return <Gate title="Staff sign-in" body="Sign in with your staff account to open the dashboard." action={signIn} />;
  }
  if (status === 403) {
    return (
      <Gate
        title="No access"
        body="This account isn't on the staff list. Ask the owner to add your email to ADMIN_EMAILS."
        action={
          <Button asChild variant="outline">
            <Link href="/">Back to the shop</Link>
          </Button>
        }
      />
    );
  }
  if (me.isLoading) {
    return (
      <div className="container mx-auto space-y-4 px-4 py-12 sm:px-6 lg:px-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (me.error || !me.data) {
    return <Gate title="Dashboard unavailable" body={(me.error as Error)?.message || "Please try again in a minute."} />;
  }

  return (
    <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-bold">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Signed in as {me.data.email}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="bookings">Appointments</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview onJump={jump} />
        </TabsContent>
        <TabsContent value="orders">
          <OrdersTab initial={filters.orders} />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsTab initial={filters.bookings} />
        </TabsContent>
        <TabsContent value="inventory">
          <InventoryTab />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
