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
import { createElectionAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

export function NewElectionDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"OFFICER" | "ISSUE">("OFFICER");
  const [state, formAction, isPending] = useActionState(createElectionAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="mr-1.5 size-4" />
          Create Election
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Election / Referendum</DialogTitle>
          <DialogDescription>
            Configure an election for administrative officers or an issue referendum.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="election-title">Title</Label>
            <Input id="election-title" name="title" placeholder="e.g. Executive President Election" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="election-description">Description</Label>
            <textarea
              id="election-description"
              name="description"
              placeholder="Describe the purpose of this election..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="election-type">Election Type</Label>
              <select
                id="election-type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
              >
                <option value="OFFICER">Officer Election</option>
                <option value="ISSUE">Issue Referendum</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="election-anon">Ballot Privacy</Label>
              <select
                id="election-anon"
                name="isAnonymous"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
              >
                <option value="true">Anonymous (Recommended)</option>
                <option value="false">Open / Public Ballot</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="election-starts">Starts At</Label>
              <Input id="election-starts" name="startsAt" type="datetime-local" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="election-ends">Ends At</Label>
              <Input id="election-ends" name="endsAt" type="datetime-local" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="election-quorum">Quorum Threshold (%)</Label>
              <Input id="election-quorum" name="quorumPercentage" type="number" min={0} max={100} defaultValue={50} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="election-pass">Pass Threshold (%)</Label>
              <Input id="election-pass" name="passPercentage" type="number" min={0} max={100} defaultValue={50} />
            </div>
          </div>

          {type === "OFFICER" ? (
            <div className="rounded-xl border border-glass-border bg-glass-card/15 p-4 flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nomination & Vetting Settings</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="election-nom-starts">Nomination Starts</Label>
                  <Input id="election-nom-starts" name="nominationStartsAt" type="datetime-local" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="election-nom-ends">Nomination Ends</Label>
                  <Input id="election-nom-ends" name="nominationEndsAt" type="datetime-local" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="election-tenure">Min Tenure (Months)</Label>
                  <Input id="election-tenure" name="minNomineeTenureMonths" type="number" min={0} defaultValue={0} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="election-seconders">Min Seconders Required</Label>
                  <Input id="election-seconders" name="minSecondersRequired" type="number" min={0} defaultValue={0} />
                </div>
              </div>

              <div className="flex gap-6 mt-1">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="requireGoodStandingForNominee" value="true" defaultChecked className="rounded border-input text-indigo-600 focus:ring-indigo-500" />
                  Require Good Standing
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="requireNoArrearsForNominee" value="true" defaultChecked className="rounded border-input text-indigo-600 focus:ring-indigo-500" />
                  Require No Arrears
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-glass-border bg-glass-card/15 p-4 flex flex-col gap-2">
              <Label htmlFor="election-options">Referendum Choices</Label>
              <Input id="election-options" name="options" placeholder="e.g. YES, NO, ABSTAIN" required />
              <p className="text-xs text-muted-foreground">Provide choices separated by commas.</p>
            </div>
          )}

          {state.error && (
            <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
              {state.error}
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button type="submit" disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full">
              {isPending ? (
                <>
                  <Loader2 className="animate-spin mr-1.5" />
                  Creating Election…
                </>
              ) : (
                "Create Election"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
