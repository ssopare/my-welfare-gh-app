"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface FundTrendRow {
  month: string;
  balance: number;
}

const chartConfig = {
  balance: { label: "Fund position", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

// Real data straight from GET /reports/fund-position-trend — a running
// cash balance derived fresh from the ledger each request, not a stored
// history table. Same restrained-glassmorphism-on-chrome-only, faint-grid,
// gradient-fill treatment as CollectionChart, just an area over time
// instead of grouped bars.
export function FundTrendChart({ data }: { data: FundTrendRow[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8 }}>
        <defs>
          <linearGradient id="gradientFundBalance" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
          className="fill-muted-foreground/80 font-medium"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent indicator="dot" className="border-glass-border bg-glass-card/90 backdrop-blur-md shadow-lg" />
          }
        />
        <Area
          dataKey="balance"
          type="monotone"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          fill="url(#gradientFundBalance)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
