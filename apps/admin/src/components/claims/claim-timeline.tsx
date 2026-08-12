import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Claim } from "@welfare/shared-types";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Stage labels come from the tenant's own benefitRule.approvalChain — a
// free-form, per-tenant array (no fixed "committee"/"final" vocabulary
// exists), never hardcoded illustrative names. A rule with zero stages
// pays out on eligibility alone (ClaimService.submit), so that case is
// rendered as its own single "no stages configured" line rather than an
// empty timeline.
export function ClaimTimeline({ claim }: { claim: Claim }) {
  const chain = claim.benefitRule?.approvalChain ?? [];

  if (chain.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This benefit has no approval stages configured — it pays out automatically on eligibility.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4 border-l border-border pl-4">
      {chain.map((stageName, index) => {
        const action = claim.stageActions.find((a) => a.stageIndex === index);
        const isPending = !action && index === claim.currentStageIndex && claim.status === "SUBMITTED";
        const isFuture = !action && !isPending;

        return (
          <li key={index} className="relative">
            <span
              className={cn(
                "absolute -left-[21px] top-1 flex size-2.5 items-center justify-center rounded-full ring-4 ring-background",
                action?.decision === "APPROVE" && "bg-status-good",
                action?.decision === "REJECT" && "bg-status-bad",
                isPending && "bg-status-warn",
                isFuture && "bg-border",
              )}
            />
            <div className="flex items-center gap-2">
              {action?.decision === "APPROVE" && <CheckCircle2 className="size-4 text-status-good" aria-hidden />}
              {action?.decision === "REJECT" && <XCircle className="size-4 text-status-bad" aria-hidden />}
              {!action && <Circle className={cn("size-4", isPending ? "text-status-warn" : "text-muted-foreground")} aria-hidden />}
              <p className="text-sm font-medium">{stageName}</p>
              {isPending && <span className="text-xs text-status-warn">Awaiting decision</span>}
            </div>
            {action?.comment && <p className="mt-1 ml-6 text-sm text-muted-foreground">&ldquo;{action.comment}&rdquo;</p>}
            {action && <p className="mt-0.5 ml-6 text-xs text-muted-foreground">{formatDateTime(action.decidedAt)}</p>}
          </li>
        );
      })}
    </ol>
  );
}
