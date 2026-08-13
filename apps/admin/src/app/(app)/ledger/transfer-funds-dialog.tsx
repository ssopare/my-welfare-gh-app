"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
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
import { transferFundsAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

// Moves real money between two of the org's own funds — posts two linked
// ledger entries server-side (see LedgerService.transferBetweenFunds).
// otherFunds excludes `fromFund` itself; a fund can't transfer to itself.
export function TransferFundsDialog({ fromFund, otherFunds }: { fromFund: Fund; otherFunds: Fund[] }) {
  const [open, setOpen] = useState(false);
  const action = transferFundsAction.bind(null, fromFund.id);
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  if (otherFunds.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowRightLeft aria-hidden />
          Transfer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer from {fromFund.name}</DialogTitle>
          <DialogDescription>
            Posts as a real Transfer Out / Transfer In pair — never counted as income or
            expenditure on either fund&apos;s Income &amp; Expenditure Statement.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="toFundId">To fund</Label>
            <Select name="toFundId" required>
              <SelectTrigger id="toFundId" className="w-full">
                <SelectValue placeholder="Choose a destination fund" />
              </SelectTrigger>
              <SelectContent>
                {otherFunds.map((fund) => (
                  <SelectItem key={fund.id} value={fund.id}>
                    {fund.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amountValue">Amount (GHS)</Label>
            <Input id="amountValue" name="amountValue" type="number" step="0.01" min="0.01" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Reason (optional)</Label>
            <Input id="description" name="description" placeholder="e.g. Seeding the medical fund" />
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
                  Transferring…
                </>
              ) : (
                "Transfer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
