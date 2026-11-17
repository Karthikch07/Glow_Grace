import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/admin";
import { Empty, Pager, formatDateTime } from "./shared";

const ENTITY_LABEL = { order: "Order", booking: "Booking", product: "Stock" } as const;

export function ActivityTab() {
  const [entity, setEntity] = useState<"" | "order" | "booking" | "product">("");
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "audit", entity, page],
    queryFn: () => adminApi.audit({ entity: entity || undefined, page }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const pick = (e: typeof entity) => {
    setEntity(e);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["", "order", "booking", "product"] as const).map((e) => (
          <Button key={e || "all"} size="sm" variant={entity === e ? "default" : "outline"} onClick={() => pick(e)}>
            {e ? `${ENTITY_LABEL[e]}s` : "Everything"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <Empty>Couldn't load activity. {(error as Error).message}</Empty>
      ) : !data || data.items.length === 0 ? (
        <Empty>No staff activity recorded yet. Changes made in this dashboard will appear here.</Empty>
      ) : (
        <Card className="divide-y">
          {data.items.map((a) => (
            <div key={a.id} className="flex flex-col gap-1 p-4 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p>
                  <span className="font-medium">{ENTITY_LABEL[a.entity]}</span> <span className="font-mono text-xs">{a.entityRef}</span>
                </p>
                <p className="text-muted-foreground">{a.summary}</p>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                <p>{formatDateTime(a.createdAt)}</p>
                <p className="break-all">{a.actorEmail ?? "unknown"}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
