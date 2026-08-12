"use client";

import { useActionState, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reverseJournalEntryAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

// The design plan's exact example of a confirmation that earns its
// weight: not "Are you sure?" but the real transaction reference and real
// consequence spelled out — this creates a second, permanent contra entry;
// the original is never edited or deleted.
export function ReverseEntryDialog({
  entryId,
  description,
  amount,
  currency,
}: {
  entryId: string;
  description: string;
  amount: string;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = reverseJournalEntryAction.bind(null, entryId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Undo2 aria-hidden />
          Reverse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse this journal entry?</DialogTitle>
          <DialogDescription>
            &ldquo;{description}&rdquo; — this posts a new, balanced contra entry that nets the
            affected accounts back to zero. The original entry is never edited or deleted, and
            this cannot itself be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-status-bad-border bg-status-bad-bg px-4 py-3">
          <span className="text-sm text-status-bad">Reversing</span>
          <MoneyDisplay value={amount} currency={currency} tone="bad" />
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" name="reason" placeholder="e.g. Entered against the wrong member" required />
          </div>

          {state.error && (
            <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Reversing…
                </>
              ) : (
                "Confirm reversal"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
