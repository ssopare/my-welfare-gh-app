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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Fund } from "@welfare/shared-types";
import { createBudgetAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

// A Budget's "category" is just an existing Income/Expense ledger account
// (see BudgetService's comment on why no separate category concept is
// needed) — so this picker is every fund's Income/Expense accounts,
// grouped by fund, sourced straight from GET /funds.
export function NewBudgetDialog({ funds }: { funds: Fund[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createBudgetAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  const budgetableAccounts = funds.map((fund) => ({
    fund,
    accounts: fund.ledgerAccounts.filter((a) => a.type === "INCOME" || a.type === "EXPENSE"),
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="print:hidden">
          <Plus aria-hidden />
          New budget
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New budget</DialogTitle>
          <DialogDescription>
            Set a target for an Income or Expense account over a period — Actual is always computed fresh
            from real ledger activity in that same period, never entered by hand.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ledgerAccountId">Account</Label>
            <Select name="ledgerAccountId" required>
              <SelectTrigger id="ledgerAccountId" className="w-full">
                <SelectValue placeholder="Choose an income or expense account" />
              </SelectTrigger>
              <SelectContent>
                {budgetableAccounts.map(
                  ({ fund, accounts }) =>
                    accounts.length > 0 && (
                      <SelectGroup key={fund.id}>
                        <SelectLabel>{fund.name}</SelectLabel>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Label (optional)</Label>
            <Input id="name" name="name" placeholder="e.g. 2026 Medical Support budget" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodStart">Period start</Label>
              <Input id="periodStart" name="periodStart" type="date" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodEnd">Period end</Label>
              <Input id="periodEnd" name="periodEnd" type="date" required />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amountValue">Budgeted amount (GHS)</Label>
            <Input id="amountValue" name="amountValue" type="number" step="0.01" min="0.01" required />
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
                "Create budget"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
