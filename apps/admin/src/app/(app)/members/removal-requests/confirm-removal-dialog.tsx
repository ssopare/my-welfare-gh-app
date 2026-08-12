"use client";

import { useActionState, useState } from "react";
import { Loader2, UserX } from "lucide-react";
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
import { confirmRemovalAction, type ConfirmRemovalState } from "./actions";

const INITIAL_STATE: ConfirmRemovalState = { error: null };

// The payoff of maker-checker: this is the moment removal actually takes
// effect, by a different admin than the one who proposed it. Same
// full-consequence-confirmation pattern as DisburseClaimDialog — never a
// bare "Are you sure?".
export function ConfirmRemovalDialog({
  requestId,
  memberPhoneNumber,
  reason,
}: {
  requestId: string;
  memberPhoneNumber: string;
  reason: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = confirmRemovalAction.bind(null, requestId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          <UserX aria-hidden />
          Confirm removal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm removing {memberPhoneNumber}?</DialogTitle>
          <DialogDescription>
            This is the second sign-off maker-checker requires — confirming actually moves the
            member to Exited now. Stated reason: &ldquo;{reason}&rdquo;. The member is unlisted
            from the active roster, not deleted, and can be reinstated later.
          </DialogDescription>
        </DialogHeader>

        {state.error && (
          <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
            {state.error}
          </p>
        )}

        <form action={formAction}>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Confirming…
                </>
              ) : (
                "Confirm removal"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
