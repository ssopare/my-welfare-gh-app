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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUBSCRIPTION_STATUSES, type PlatformSubscriptionRow } from "@welfare/shared-types";
import { updateSubscriptionStatusAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

// No real payment-gateway/dunning automation exists for platform billing
// itself yet (§18) — this manual lever *is* the trial→active→past-due→
// suspended→cancelled lifecycle for now, same "primitive now" bootstrap
// as MockPaymentProvider stood in for the welfare-fund side. A real,
// stated confirmation earns its place here for the same reason it does on
// a ledger reversal: this directly controls whether a tenant can log in
// and use their own console.
export function UpdateStatusDialog({ subscription }: { subscription: PlatformSubscriptionRow }) {
  const [open, setOpen] = useState(false);
  const boundAction = updateSubscriptionStatusAction.bind(null, subscription.organisationId);
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
          <Settings2 aria-hidden />
          Update status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update {subscription.organisation?.legalName ?? "this organisation"}&apos;s subscription</DialogTitle>
          <DialogDescription>
            Directly changes whether this tenant can access their own console — there is no automated billing
            enforcement yet, this status change is the actual, real effect.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={subscription.status}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBSCRIPTION_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPeriodEnd">Current period ends (optional)</Label>
            <Input
              id="currentPeriodEnd"
              name="currentPeriodEnd"
              type="date"
              defaultValue={subscription.currentPeriodEnd?.slice(0, 10)}
            />
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
                "Confirm change"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
