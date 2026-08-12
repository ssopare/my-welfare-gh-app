"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
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
import { decideClaimAction, type FormActionState } from "../actions";

const INITIAL_STATE: FormActionState = { error: null };

export function DecideClaimDialog({
  claimId,
  decision,
  stageName,
}: {
  claimId: string;
  decision: "APPROVE" | "REJECT";
  stageName: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = decideClaimAction.bind(null, claimId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  const approving = decision === "APPROVE";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={approving ? "default" : "destructive"} size="sm">
          {approving ? <Check aria-hidden /> : <X aria-hidden />}
          {approving ? "Approve" : "Reject"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{approving ? "Approve" : "Reject"} this claim?</DialogTitle>
          <DialogDescription>
            Records your decision at the &ldquo;{stageName}&rdquo; stage permanently — this cannot be edited or removed
            afterward.
            {approving && " If this is the final stage, the claim becomes payable immediately."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="decision" value={decision} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comment">Comment (optional)</Label>
            <Input id="comment" name="comment" placeholder="e.g. Verified against submitted evidence" />
          </div>

          {state.error && (
            <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" variant={approving ? "default" : "destructive"} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                `Confirm ${approving ? "approval" : "rejection"}`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
