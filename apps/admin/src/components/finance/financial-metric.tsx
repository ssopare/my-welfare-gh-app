import React, { type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// The KPI card primitive — label small and quiet, the number large and
// the whole point, an optional supporting line for context. One of the
// design plan's scoped glassmorphism moments: a soft blur on the card
// surface is appropriate here (a summary number, not a dense table).
//
// trend is deliberately optional with no default/fallback value — Phase
// 1's reporting endpoints don't return period-over-period deltas for
// everything yet, and a fabricated percentage would be worse than no
// trend line at all. Only pass it where the caller has a real prior-
// period figure to compare against.
interface FinancialMetricProps {
  label: string;
  value: ReactNode;
  support?: ReactNode;
  trend?: { direction: "up" | "down"; label: string };
  icon?: ReactNode;
  className?: string;
}

export function FinancialMetric({ label, value, support, trend, icon, className }: FinancialMetricProps) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-glass-border bg-glass-card/65 py-5 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-primary/30 dark:bg-glass-card/45",
        className,
      )}
    >
      {/* Dynamic Background Glow Spot */}
      <div className="absolute -right-6 -bottom-6 size-24 rounded-full opacity-[0.01] group-hover:opacity-[0.06] blur-xl transition-all duration-500 bg-primary pointer-events-none" />

      {/* Left Vertical Color Accent Bar */}
      <div className="absolute inset-y-0 left-0 w-[4px] bg-gradient-to-b from-primary to-primary/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <CardContent className="flex items-start justify-between gap-3 relative z-10">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="mt-2">{value}</div>
          {support && <p className="mt-1.5 text-xs text-muted-foreground">{support}</p>}
          {trend && (
            <p
              className={cn(
                "mt-1.5 flex items-center gap-1 text-xs font-medium",
                trend.direction === "up" ? "text-status-good" : "text-status-bad",
              )}
            >
              {trend.direction === "up" ? (
                <ArrowUp className="size-3" aria-hidden />
              ) : (
                <ArrowDown className="size-3" aria-hidden />
              )}
              {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
