"use client";

import { useRouter } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DASHBOARD_PERIODS, type DashboardPeriodValue } from "@/lib/dashboard-periods";

// Scopes the KPI row's contribution-summary-derived figures (collection
// rate, outstanding) to a real date range — threaded through as a query
// param so the choice survives a refresh/share, same pattern as the
// claims page's status filter chips. The two 6-month trend charts stay on
// their own fixed windows; this only affects numbers that are genuinely
// period-scoped by nature.
export function DashboardPeriodFilter({
  value,
  rangeLabel,
}: {
  value: DashboardPeriodValue;
  rangeLabel: string;
}) {
  const router = useRouter();
  const current = DASHBOARD_PERIODS.find((p) => p.value === value) ?? DASHBOARD_PERIODS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 border-glass-border bg-glass-card/65 backdrop-blur-md">
          <Calendar className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{rangeLabel}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {DASHBOARD_PERIODS.map((period) => (
          <DropdownMenuItem
            key={period.value}
            onSelect={() => router.push(`/?period=${period.value}`)}
            className={period.value === current.value ? "font-medium text-primary" : undefined}
          >
            {period.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
