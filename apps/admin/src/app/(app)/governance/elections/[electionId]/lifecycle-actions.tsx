"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ElectionStatus } from "@welfare/shared-types";
import { Button } from "@/components/ui/button";
import { transitionElectionStatusAction } from "../../actions";
import {
  ChevronRight,
  Play,
  CheckCircle,
  XCircle,
  Users,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Each step in the election lifecycle pipeline
const STEPS: { status: ElectionStatus; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "NOMINATION", label: "Nominations" },
  { status: "VETTING", label: "Vetting" },
  { status: "ACTIVE", label: "Voting Open" },
  { status: "COMPLETED", label: "Completed" },
];

const STATUS_ORDER: ElectionStatus[] = [
  "DRAFT",
  "NOMINATION",
  "VETTING",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];

function getStepIndex(status: ElectionStatus) {
  return STATUS_ORDER.indexOf(status);
}

// The natural next transition from a given status
const NEXT_TRANSITION: Partial<Record<ElectionStatus, { status: ElectionStatus; label: string; icon: React.ElementType; variant: "default" | "destructive" | "outline" }>> = {
  DRAFT: { status: "NOMINATION", label: "Open Nominations", icon: Users, variant: "default" },
  NOMINATION: { status: "VETTING", label: "Move to Vetting", icon: ClipboardCheck, variant: "default" },
  VETTING: { status: "ACTIVE", label: "Activate Voting", icon: Play, variant: "default" },
  ACTIVE: { status: "COMPLETED", label: "Close Election", icon: CheckCircle, variant: "default" },
};

// Skip nomination+vetting: DRAFT → ACTIVE directly (for quick elections)
const SKIP_TO_ACTIVE: Partial<Record<ElectionStatus, boolean>> = {
  DRAFT: true,
  NOMINATION: true,
};

interface LifecycleActionsProps {
  electionId: string;
  currentStatus: ElectionStatus;
}

export function LifecycleActions({
  electionId,
  currentStatus,
}: LifecycleActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const currentIndex = getStepIndex(currentStatus);
  const isCancelled = currentStatus === "CANCELLED";
  const isTerminal = currentStatus === "COMPLETED" || isCancelled;

  function handleTransition(status: ElectionStatus) {
    startTransition(async () => {
      const result = await transitionElectionStatusAction(electionId, status);
      if (!result.error) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  const nextTransition = NEXT_TRANSITION[currentStatus];
  const canSkipToActive = SKIP_TO_ACTIVE[currentStatus];

  return (
    <div className="flex flex-col gap-5">
      {/* ── Lifecycle Stepper ── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((step, i) => {
          const stepIdx = getStepIndex(step.status);
          const isDone = !isCancelled && currentIndex > stepIdx;
          const isCurrent = !isCancelled && currentIndex === stepIdx;
          const isFuture = isCancelled || currentIndex < stepIdx;

          return (
            <div key={step.status} className="flex items-center gap-1 shrink-0">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                    isDone && "border-emerald-500 bg-emerald-500 text-white",
                    isCurrent && "border-indigo-500 bg-indigo-500/10 text-indigo-500",
                    isFuture && !isCancelled && "border-border bg-muted text-muted-foreground",
                    isCancelled && "border-red-400 bg-red-50 text-red-400"
                  )}
                >
                  {isDone ? <CheckCircle className="size-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium whitespace-nowrap",
                    isDone && "text-emerald-500",
                    isCurrent && "text-indigo-500",
                    isFuture && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-px w-6 mt-[-16px]",
                    isDone ? "bg-emerald-500" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}

        {isCancelled && (
          <>
            <ChevronRight className="size-3 text-muted-foreground shrink-0" />
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-red-400 bg-red-50 text-red-400">
                <XCircle className="size-4" />
              </div>
              <span className="text-[10px] font-medium text-red-400">Cancelled</span>
            </div>
          </>
        )}
      </div>

      {/* ── Action Buttons ── */}
      {!isTerminal && (
        <div className="flex flex-wrap gap-2">
          {nextTransition && (
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => handleTransition(nextTransition.status)}
              className="gap-1.5"
            >
              <nextTransition.icon className="size-3.5" />
              {nextTransition.label}
            </Button>
          )}

          {canSkipToActive && currentStatus !== "ACTIVE" && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => handleTransition("ACTIVE")}
              className="gap-1.5"
            >
              <Play className="size-3.5" />
              Skip to Active Voting
            </Button>
          )}

          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => handleTransition("CANCELLED")}
            className="gap-1.5 ml-auto"
          >
            <XCircle className="size-3.5" />
            Cancel Election
          </Button>
        </div>
      )}

      {isTerminal && (
        <p className="text-sm text-muted-foreground">
          {isCancelled
            ? "This election has been cancelled and cannot be reactivated."
            : "This election is complete. Results are final."}
        </p>
      )}
    </div>
  );
}
