"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { SubscriptionPlan } from "@welfare/shared-types";
import { convertPlanAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

const CADENCE_LABEL: Record<string, string> = {
  monthly: "month",
  annual: "year",
  termly: "term",
};

export function SubscribeDialog({ plan, isCurrent }: { plan: SubscriptionPlan; isCurrent: boolean }) {
  const [open, setOpen] = useState(false);
  const boundAction = convertPlanAction.bind(null, plan.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={isCurrent ? "outline" : "default"} disabled={isCurrent}>
          {isCurrent ? "Current plan" : "Choose this plan"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch to {plan.name}?</DialogTitle>
          <DialogDescription>
            Billing starts immediately for a full {CADENCE_LABEL[plan.billingCadence] ?? plan.billingCadence}, charged
            to this organisation&apos;s account on file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-status-good-border bg-status-good-bg px-4 py-3">
          <span className="text-sm text-status-good">
            Per {CADENCE_LABEL[plan.billingCadence] ?? plan.billingCadence}
          </span>
          <MoneyDisplay value={plan.priceAmount} currency={plan.currency} tone="good" />
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          {state.error && (
            <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Confirming…
                </>
              ) : (
                "Confirm subscription"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
