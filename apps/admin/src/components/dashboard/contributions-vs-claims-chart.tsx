"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface ContributionsVsClaimsChartRow {
  month: string;
  contributions: number;
  claimsPaid: number;
}

const chartConfig = {
  contributions: { label: "Contributions", color: "var(--color-chart-1)" },
  claimsPaid: { label: "Claims paid", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

// Real data straight from GET /reports/contributions-vs-claims — 6 real
// monthly totals, money in vs. money out. Same faint-grid, gradient-fill
// treatment as the other dashboard charts, with a legend since this one
// carries two distinct series rather than a paired comparison per category.
export function ContributionsVsClaimsChart({ data }: { data: ContributionsVsClaimsChartRow[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
        <defs>
          <linearGradient id="gradientContributions" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={1.0} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
          </linearGradient>
          <linearGradient id="gradientClaimsPaid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.9} />
            <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0.3} />
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
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="contributions" fill="url(#gradientContributions)" radius={[6, 6, 0, 0]} maxBarSize={20} />
        <Bar dataKey="claimsPaid" fill="url(#gradientClaimsPaid)" radius={[6, 6, 0, 0]} maxBarSize={20} />
      </BarChart>
    </ChartContainer>
  );
}
