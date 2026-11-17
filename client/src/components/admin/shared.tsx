import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Visual weight for each status. Text always carries the meaning; color only supports it. */
const TONE: Record<string, string> = {
  // needs action
  pending_payment: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  awaiting_payment: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  verification_pending: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  placed: "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
  // in progress
  confirmed: "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
  shipped: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200",
  cod_pending: "bg-muted text-foreground",
  pay_at_salon: "bg-muted text-foreground",
  // done
  delivered: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  // stopped
  cancelled: "bg-muted text-muted-foreground",
  failed: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200",
  refunded: "bg-muted text-muted-foreground",
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium", TONE[status] ?? "bg-muted text-foreground")}>
      {label}
    </span>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-4 pt-4 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2">
          Page {page} of {pages}
        </span>
        <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** A mutation that refreshes every admin query and toasts the outcome. */
export function useAdminMutation<A, R>(fn: (args: A) => Promise<R>, success?: (r: R) => string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["admin"] });
      if (success) toast({ title: success(r) });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function formatDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
