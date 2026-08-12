import { CheckCircle2, XCircle } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { cn } from "@/lib/utils";
import type { EligibilityResult } from "@welfare/shared-types";

// FR-RULE-05's explainable trace, rendered — the backend has carried this
// checks[] array since the rule-engine slice with nothing to show it. Every
// check gets its own pass/fail icon and plain-language detail line, never
// collapsed down to just the final eligible boolean.
export function EligibilityChecklist({ result }: { result: EligibilityResult }) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex items-center justify-between rounded-lg border px-4 py-3",
          result.eligible
            ? "border-status-good-border bg-status-good-bg"
            : "border-status-bad-border bg-status-bad-bg",
        )}
      >
        <div className="flex items-center gap-2">
          {result.eligible ? (
            <CheckCircle2 className="size-5 text-status-good" aria-hidden />
          ) : (
            <XCircle className="size-5 text-status-bad" aria-hidden />
          )}
          <span className={cn("font-semibold", result.eligible ? "text-status-good" : "text-status-bad")}>
            {result.eligible ? "Eligible" : "Not eligible"}
          </span>
        </div>
        {result.amount && <MoneyDisplay value={result.amount.value} currency={result.amount.currency} tone="good" />}
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {result.checks.map((check, index) => (
          <li key={index} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            {check.passed ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-good" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-status-bad" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{check.description}</p>
              <p className="text-xs text-muted-foreground">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
