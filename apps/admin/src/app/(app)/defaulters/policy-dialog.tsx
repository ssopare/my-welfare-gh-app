"use client";

import { useActionState, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
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
import type { DefaulterPolicy } from "@welfare/shared-types";
import { setPolicyAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

export function PolicyDialog({ policy }: { policy: DefaulterPolicy | null }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(setPolicyAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 aria-hidden />
          {policy ? "Edit policy" : "Set up policy"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Defaulter policy</DialogTitle>
          <DialogDescription>
            Opt-in — nothing here is enforced until this is set. Members are moved automatically when a payment event
            triggers reassessment; use &ldquo;Reassess&rdquo; below to check someone who has simply stopped paying.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defaulterThresholdMonths">Defaulter after (consecutive missed periods)</Label>
            <Input
              id="defaulterThresholdMonths"
              name="defaulterThresholdMonths"
              type="number"
              min={1}
              defaultValue={policy?.defaulterThresholdMonths}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forfeitureThresholdMonths">Suspend after (consecutive missed periods)</Label>
            <Input
              id="forfeitureThresholdMonths"
              name="forfeitureThresholdMonths"
              type="number"
              min={1}
              defaultValue={policy?.forfeitureThresholdMonths}
              required
            />
            <p className="text-xs text-muted-foreground">Must be greater than the defaulter threshold above.</p>
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
                  Saving…
                </>
              ) : (
                "Save policy"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
