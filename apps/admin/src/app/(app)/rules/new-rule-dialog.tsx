"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
import { createBenefitRuleAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

export function NewRuleDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createBenefitRuleAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          New rule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New benefit rule</DialogTitle>
          <DialogDescription>
            Created as a draft — no claim can be evaluated against it until you activate it.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" name="name" placeholder="e.g. Bereavement Benefit" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="triggerEvent">Trigger event</Label>
            <Input id="triggerEvent" name="triggerEvent" placeholder="e.g. dependant.death" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subjectTypes">Applies to (comma-separated)</Label>
            <Input id="subjectTypes" name="subjectTypes" defaultValue="self" placeholder="self, spouse, child" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-currency">Currency</Label>
              <Input id="rule-currency" name="currency" defaultValue="GHS" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-amountValue">Amount</Label>
              <Input id="rule-amountValue" name="amountValue" inputMode="decimal" placeholder="e.g. 3000.00" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="occurrenceCapMax">Max occurrences</Label>
              <Input id="occurrenceCapMax" name="occurrenceCapMax" type="number" min={1} defaultValue={1} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-minTenureMonths">Min. tenure (months)</Label>
              <Input id="rule-minTenureMonths" name="minTenureMonths" type="number" min={0} placeholder="Optional" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="goodStandingRequired"
              defaultChecked
              className="size-4 rounded border-input accent-primary"
            />
            Requires good standing
          </label>

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
                  Creating…
                </>
              ) : (
                "Create draft"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
