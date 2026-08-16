"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Nomination } from "@welfare/shared-types";
import { vetNominationAction, type FormActionState } from "../../actions";

interface VetDialogProps {
  nomination: Nomination;
  electionId: string;
  nomineeName: string;
}

const INITIAL_STATE: FormActionState = { error: null };

export function VetNominationDialog({ nomination, electionId, nomineeName }: VetDialogProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"APPROVED" | "REJECTED">("APPROVED");

  // Bind parameters to our server action
  const boundAction = vetNominationAction.bind(null, nomination.id, electionId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline" className="text-indigo-600 hover:text-indigo-700">
          Vet Nomination
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vet Nomination - {nomineeName}</DialogTitle>
          <DialogDescription>
            Approve this nomination to promote the candidate to the final ballot, or reject with a reason.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vet-status">Vetting Decision</Label>
            <select
              id="vet-status"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "APPROVED" | "REJECTED")}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
            >
              <option value="APPROVED">Approve / Promote to Ballot</option>
              <option value="REJECTED">Reject Nomination</option>
            </select>
          </div>

          {status === "REJECTED" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vet-reason">Rejection Reason</Label>
              <Input
                id="vet-reason"
                name="rejectionReason"
                placeholder="Provide a brief explanation for rejection..."
                required
              />
            </div>
          )}

          {state.error && (
            <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full">
              {isPending ? (
                <>
                  <Loader2 className="animate-spin mr-1.5" />
                  Submitting Decision…
                </>
              ) : (
                "Submit Vetting Decision"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
