"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface CollectionChartRow {
  planName: string;
  expected: number;
  collected: number;
}

const chartConfig = {
  expected: { label: "Expected", color: "var(--color-chart-4)" },
  collected: { label: "Collected", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

// Real data straight from GET /reports/contribution-summary, aggregated
// per plan on the server before this ever renders — this component just
// draws what it's given. Given the same care as type: a faint grid, an
// emphasized pair per plan, nothing decorative.
export function CollectionChart({ data }: { data: CollectionChartRow[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
        <defs>
          <linearGradient id="gradientExpected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.8} />
            <stop offset="100%" stopColor="var(--color-chart-4)" stopOpacity={0.2} />
          </linearGradient>
          <linearGradient id="gradientCollected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={1.0} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis
          dataKey="planName"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
          className="fill-muted-foreground/80 font-medium"
        />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" className="border-glass-border bg-glass-card/90 backdrop-blur-md shadow-lg" />} />
        <Bar dataKey="expected" fill="url(#gradientExpected)" radius={[6, 6, 0, 0]} maxBarSize={32} />
        <Bar dataKey="collected" fill="url(#gradientCollected)" radius={[6, 6, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ChartContainer>
  );
}
