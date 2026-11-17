import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Bag", "Details & payment", "Confirmation"] as const;

export function CheckoutSteps({ current, className }: { current: 0 | 1 | 2; className?: string }) {
  return (
    <ol className={cn("flex items-center gap-2 text-xs font-medium", className)} aria-label="Checkout progress">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary ring-4 ring-primary/10",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn("whitespace-nowrap", active ? "text-foreground" : "text-muted-foreground", !active && "hidden sm:inline")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className={cn("h-px w-6 sm:w-10", done ? "bg-primary" : "bg-border")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
