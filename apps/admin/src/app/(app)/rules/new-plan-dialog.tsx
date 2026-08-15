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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Fund } from "@welfare/shared-types";
import { createContributionPlanAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

export function NewPlanDialog({ funds }: { funds: Fund[] }) {
  const [open, setOpen] = useState(false);
  const [computationType, setComputationType] = useState("fixed");
  const [state, formAction, isPending] = useActionState(createContributionPlanAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) {
      setOpen(false);
      setComputationType("fixed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          New plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New contribution plan</DialogTitle>
          <DialogDescription>
            Created as a draft — nothing is charged to members until you activate it.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" name="name" placeholder="e.g. Monthly Dues" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="computationType">Plan Type</Label>
            <Select name="computationType" value={computationType} onValueChange={setComputationType}>
              <SelectTrigger id="computationType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
                <SelectItem value="voluntary">Voluntary / Donation</SelectItem>
                <SelectItem value="minimum">Minimum Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cadence">Cadence</Label>
              <Select name="cadence" defaultValue="monthly">
                <SelectTrigger id="cadence" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="event_triggered">Event-triggered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" name="currency" defaultValue="GHS" required />
            </div>
          </div>

          {computationType !== "voluntary" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amountValue">
                {computationType === "minimum" ? "Minimum Amount" : "Amount"}
              </Label>
              <Input id="amountValue" name="amountValue" inputMode="decimal" placeholder="e.g. 20.00" required />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defaultFundId">Default fund (optional)</Label>
            <Select name="defaultFundId">
              <SelectTrigger id="defaultFundId" className="w-full">
                <SelectValue placeholder="No default — picked manually each time" />
              </SelectTrigger>
              <SelectContent>
                {funds.map((fund) => (
                  <SelectItem key={fund.id} value={fund.id}>
                    {fund.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pre-selected when recording a payment against this plan, so routine dues can&apos;t
              land in the wrong fund by accident.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="minTenureMonths">Min. tenure (months)</Label>
              <Input id="minTenureMonths" name="minTenureMonths" type="number" min={0} placeholder="Optional" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentGracePeriodDays">Payment grace (days)</Label>
              <Input id="paymentGracePeriodDays" name="paymentGracePeriodDays" type="number" min={0} placeholder="Optional" />
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
