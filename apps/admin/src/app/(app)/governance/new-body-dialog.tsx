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
import { createGovernanceBodyAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

export function NewBodyDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createGovernanceBodyAction, INITIAL_STATE);

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
          New body
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New governance body</DialogTitle>
          <DialogDescription>
            Officers can be recorded administratively — formal motions, minutes, and votes are a later phase.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body-name">Name</Label>
            <Input id="body-name" name="name" placeholder="e.g. Executive Committee" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meetingCadence">Meeting cadence (optional)</Label>
            <Input id="meetingCadence" name="meetingCadence" placeholder="e.g. Quarterly" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quorumRule">Quorum rule (optional)</Label>
            <Input id="quorumRule" name="quorumRule" placeholder="e.g. Two-thirds of members" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maxConsecutiveTerms">Max consecutive terms</Label>
              <Input id="maxConsecutiveTerms" name="maxConsecutiveTerms" type="number" min={1} placeholder="No limit" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coolingOffPeriodMonths">Cooling-off (months)</Label>
              <Input id="coolingOffPeriodMonths" name="coolingOffPeriodMonths" type="number" min={0} placeholder="Optional" />
            </div>
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
                  Creating…
                </>
              ) : (
                "Create body"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
