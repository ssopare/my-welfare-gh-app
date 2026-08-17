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
import { createSubscriptionPlanAction, type FormActionState } from "../actions";

const INITIAL_STATE: FormActionState = { error: null };

export function NewPlanDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createSubscriptionPlanAction, INITIAL_STATE);

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
          New plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New subscription plan</DialogTitle>
          <DialogDescription>Immediately visible to every tenant choosing or switching plans.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" name="name" placeholder="e.g. Standard" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" name="currency" defaultValue="GHS" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priceAmount">Price</Label>
              <Input id="priceAmount" name="priceAmount" inputMode="decimal" placeholder="e.g. 50.00" required />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billingCadence">Billing cadence</Label>
            <Select name="billingCadence" defaultValue="monthly">
              <SelectTrigger id="billingCadence" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="termly">Termly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trialDays">Trial days</Label>
              <Input id="trialDays" name="trialDays" type="number" min={0} placeholder="60" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="platformFeePercentage">Platform fee (%)</Label>
              <Input
                id="platformFeePercentage"
                name="platformFeePercentage"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue="0"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Retained from every contribution auto-disbursed to an organisation on this plan.
          </p>

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
                "Create plan"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
