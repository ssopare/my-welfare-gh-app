"use client";

import { useActionState, useState } from "react";
import { Banknote, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Fund } from "@welfare/shared-types";
import { disburseClaimAction, type FormActionState } from "../actions";

const INITIAL_STATE: FormActionState = { error: null };

export function DisburseClaimDialog({
  claimId,
  amount,
  currency,
  funds,
}: {
  claimId: string;
  amount: string;
  currency: string;
  funds: Fund[];
}) {
  const [open, setOpen] = useState(false);
  const boundAction = disburseClaimAction.bind(null, claimId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Banknote aria-hidden />
          Disburse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disburse this claim?</DialogTitle>
          <DialogDescription>
            Posts a real, balanced journal entry (Benefits Expense / Cash) immediately and marks the claim paid — this is
            not reversible from here; use the ledger&apos;s reversal if it was posted in error.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-status-good-border bg-status-good-bg px-4 py-3">
          <span className="text-sm text-status-good">Disbursing</span>
          <MoneyDisplay value={amount} currency={currency} tone="good" />
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fundId">From fund</Label>
            <Select name="fundId">
              <SelectTrigger id="fundId" className="w-full">
                <SelectValue placeholder="Choose a fund" />
              </SelectTrigger>
              <SelectContent>
                {funds.map((fund) => (
                  <SelectItem key={fund.id} value={fund.id}>
                    {fund.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  Disbursing…
                </>
              ) : (
                "Confirm disbursement"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
