"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContributionPlan } from "@welfare/shared-types";
import { createPlanAmendmentAction, type PlanAmendmentState } from "../../actions";

const INITIAL_STATE: PlanAmendmentState = { error: null };

// There is no edit button for a plan's amount deliberately — it's a real
// rule characteristic, not operational metadata, so a correction goes
// through the same draft-then-activate versioning as any other amendment
// (see ContributionPlanService.activate). This dialog just does both
// steps behind one submit: create a successor with supersedesId, then
// activate it at the chosen effective date.
export function AmendPlanDialog({ plan }: { plan: ContributionPlan }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createPlanAmendmentAction.bind(null, plan.id),
    INITIAL_STATE,
  );

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.newPlanId) {
      setOpen(false);
      router.push(`/rules/plans/${state.newPlanId}`);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil aria-hidden />
          Amend
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Amend {plan.name}</DialogTitle>
          <DialogDescription>
            Creates a new version and supersedes this one — the old amount stays intact for
            anything already billed under it. Use a future date for a real rate change voted on
            by the group, or today&apos;s date to correct a mistake immediately.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amendment-amount">New amount</Label>
            <Input
              id="amendment-amount"
              name="amountValue"
              inputMode="decimal"
              defaultValue={plan.amountValue}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amendment-effectiveFrom">Effective from</Label>
            <Input
              id="amendment-effectiveFrom"
              name="effectiveFrom"
              type="date"
              defaultValue={today}
              required
            />
            <p className="text-xs text-muted-foreground">
              Obligations already generated before this date keep their original amount. Anything
              generated from this date on — including advance payments that spread into future
              months — uses the new amount.
            </p>
          </div>

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
                  Amending…
                </>
              ) : (
                "Create amendment"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
