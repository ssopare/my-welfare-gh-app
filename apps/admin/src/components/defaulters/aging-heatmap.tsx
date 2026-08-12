import { MoneyDisplay } from "@/components/finance/money-display";
import { cn } from "@/lib/utils";
import type { DefaulterAgingBuckets } from "@welfare/shared-types";

const BUCKETS: { key: keyof DefaulterAgingBuckets; label: string; tone: string }[] = [
  { key: "days0To30", label: "0–30d", tone: "bg-status-warn" },
  { key: "days31To60", label: "31–60d", tone: "bg-status-warn" },
  { key: "days61To90", label: "61–90d", tone: "bg-status-bad" },
  { key: "days90Plus", label: "90d+", tone: "bg-status-bad" },
];

// A real heatmap over real data: each cell's opacity scales with how much
// of *that row's* total arrears sits in that bucket, so a row where
// everything is freshly overdue reads as faint amber, while one with old,
// deep arrears reads as a solid block of rose on the right — the pattern
// an officer should notice at a glance, not just a table of numbers.
export function AgingHeatmap({ buckets, currency }: { buckets: DefaulterAgingBuckets; currency: string }) {
  const amounts = BUCKETS.map((b) => Number.parseFloat(buckets[b.key]));
  const rowMax = Math.max(...amounts, 0.01);

  return (
    <div className="grid grid-cols-4 gap-1">
      {BUCKETS.map((bucket, i) => {
        const amount = amounts[i];
        const intensity = amount > 0 ? 0.15 + 0.75 * (amount / rowMax) : 0;
        return (
          <div
            key={bucket.key}
            className="relative flex h-11 flex-col items-center justify-center rounded-md text-center"
            title={`${bucket.label}: ${amount.toFixed(2)} ${currency}`}
          >
            <div className={cn("absolute inset-0 rounded-md", bucket.tone)} style={{ opacity: intensity }} />
            <span className="relative text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {bucket.label}
            </span>
            <span className="relative text-xs font-medium tabular-nums">
              {amount > 0 ? <MoneyDisplay value={amount} currency={currency} size="sm" className="text-xs" /> : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
