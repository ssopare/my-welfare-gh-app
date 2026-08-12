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
import { createFundAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

// A fund's standard chart of accounts (Cash, Contributions Income,
// Benefits Payable/Expense, Fund Equity) is provisioned automatically the
// moment this succeeds — nothing else to configure here, so this stays a
// one-field dialog rather than a bigger settings form.
export function CreateFundDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createFundAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus aria-hidden />
          New fund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a fund</DialogTitle>
          <DialogDescription>
            Sets up a standard chart of accounts automatically — Cash, Contributions Income,
            Benefits Payable, Benefits Expense, and Fund Equity — ready to post real entries
            against immediately.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Fund name</Label>
            <Input id="name" name="name" placeholder="e.g. General Welfare Fund" required autoFocus />
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
                "Create fund"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
