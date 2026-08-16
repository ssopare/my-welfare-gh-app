"use client";

import type { ElectionResultsResponse } from "@welfare/shared-types";
import { cn } from "@/lib/utils";

interface ResultsChartProps {
  results: ElectionResultsResponse;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "from-emerald-500 to-green-400",
  COMPLETED: "from-indigo-500 to-violet-400",
  DRAFT: "from-zinc-400 to-slate-300",
  NOMINATION: "from-amber-500 to-yellow-400",
  VETTING: "from-orange-500 to-amber-400",
  CANCELLED: "from-red-500 to-rose-400",
};

function TurnoutGauge({ results }: ResultsChartProps) {
  const pct = Math.round(results.turnoutPercentage);
  const quorumPct = Math.round(results.quorumPercentage);
  const quorumMet = results.quorumMet;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Turnout</span>
        <span
          className={cn(
            "font-bold tabular-nums",
            quorumMet ? "text-emerald-500" : "text-amber-500"
          )}
        >
          {pct}%
        </span>
      </div>

      {/* Turnout bar with quorum marker */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r transition-all duration-700",
            quorumMet ? "from-emerald-500 to-green-400" : "from-amber-500 to-yellow-400"
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        {/* Quorum threshold marker */}
        <div
          className="absolute top-0 h-full w-px bg-foreground/40"
          style={{ left: `${quorumPct}%` }}
          title={`Quorum threshold: ${quorumPct}%`}
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {results.totalVotesCast} / {results.totalEligible} votes
        </span>
        <span className={quorumMet ? "text-emerald-500 font-semibold" : "text-amber-500 font-semibold"}>
          {quorumMet ? "✓ Quorum met" : `Quorum at ${quorumPct}%`}
        </span>
      </div>
    </div>
  );
}

export function ResultsChart({ results }: ResultsChartProps) {
  if (!results.results.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No results yet.
      </p>
    );
  }

  const maxCount = Math.max(...results.results.map((r) => r.count), 1);
  const gradientClass = STATUS_COLORS[results.status] ?? "from-indigo-500 to-violet-400";

  // Find winner (highest count) for highlighting
  const winnerCount = maxCount;
  const isCompleted = results.status === "COMPLETED";

  return (
    <div className="flex flex-col gap-6">
      <TurnoutGauge results={results} />

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-foreground">Votes by Candidate / Option</span>

        {results.results
          .slice()
          .sort((a, b) => b.count - a.count)
          .map((entry, i) => {
            const pct = maxCount > 0 ? Math.round((entry.count / results.totalVotesCast || 0) * 100) : 0;
            const barPct = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
            const isWinner = isCompleted && entry.count === winnerCount && entry.count > 0;

            return (
              <div key={entry.optionId} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {isCompleted && i === 0 && entry.count > 0 && (
                      <span className="text-amber-500 text-xs">🏆</span>
                    )}
                    <span
                      className={cn(
                        "font-medium",
                        isWinner ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {entry.label}
                    </span>
                  </div>
                  <span className="font-bold tabular-nums text-foreground">
                    {entry.count} <span className="text-muted-foreground font-normal">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full bg-gradient-to-r transition-all duration-700",
                      gradientClass
                    )}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
