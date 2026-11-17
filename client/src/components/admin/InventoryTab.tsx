import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi, type InventoryRow } from "@/lib/admin";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Empty, useAdminMutation } from "./shared";

function StockCell({ row, low }: { row: InventoryRow; low: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = useAdminMutation(
    (body: { stock: number } | { adjust: number }) => adminApi.setStock(row.sku, body),
    (r) => `${r.name}: ${r.stock} in stock`,
  );
  const value = draft ?? String(row.stock);
  const parsed = Number.parseInt(value, 10);
  const dirty = draft !== null && Number.isFinite(parsed) && parsed >= 0 && parsed !== row.stock;

  const commit = () => {
    if (dirty) save.mutate({ stock: parsed }, { onSettled: () => setDraft(null) });
    else setDraft(null);
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label={`Remove one ${row.name}`} disabled={save.isPending || row.stock === 0} onClick={() => save.mutate({ adjust: -1 })}>
        <Minus />
      </Button>
      <Input
        inputMode="numeric"
        className={cn("h-9 w-20 text-center tabular-nums", low && "border-amber-500")}
        value={value}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        aria-label={`Stock for ${row.name}`}
        disabled={save.isPending}
      />
      <Button variant="ghost" size="icon" aria-label={`Add one ${row.name}`} disabled={save.isPending} onClick={() => save.mutate({ adjust: 1 })}>
        <Plus />
      </Button>
    </div>
  );
}

export function InventoryTab() {
  const [filter, setFilter] = useState<"all" | "low">("all");
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "inventory"], queryFn: adminApi.inventory, staleTime: 10_000 });

  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !data) return <Empty>Couldn't load inventory. {(error as Error)?.message}</Empty>;

  const threshold = data.lowStockThreshold;
  const lowCount = data.items.filter((p) => p.stock <= threshold).length;
  const rows = filter === "low" ? data.items.filter((p) => p.stock <= threshold) : data.items;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Type a new count and press Enter, or use − / + for single units. Prices are set in <code className="text-xs">shared/catalog.ts</code>.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            All ({data.items.length})
          </Button>
          <Button size="sm" variant={filter === "low" ? "default" : "outline"} onClick={() => setFilter("low")}>
            Low stock ({lowCount})
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>Everything is well stocked.</Empty>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">In stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const low = p.stock <= threshold;
                return (
                  <TableRow key={p.sku}>
                    <TableCell>
                      <span className="block font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.brand}
                        {!p.tracked && " · not tracked yet"}
                        {low && <span className="font-medium text-amber-700 dark:text-amber-400"> · {p.stock === 0 ? "sold out" : "low"}</span>}
                      </span>
                    </TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(p.price)}
                      {p.mrp > p.price && <span className="block text-xs text-muted-foreground line-through">{formatCurrency(p.mrp)}</span>}
                    </TableCell>
                    <TableCell>
                      <StockCell row={p} low={low} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
