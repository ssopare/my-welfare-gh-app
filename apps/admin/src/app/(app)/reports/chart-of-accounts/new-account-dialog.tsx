"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Fund, LedgerAccountType } from "@welfare/shared-types";
import { createLedgerAccountAction, type FormActionState } from "../../ledger/actions";

const INITIAL_STATE: FormActionState = { error: null };

const TYPES: LedgerAccountType[] = ["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"];

// Extends one fund's flat chart of accounts beyond the standard 6 — see
// FundService.createAccount. The "administrative" flag only applies to a
// new EXPENSE account, and is what turns Financial Health's Expense
// Ratio / Administrative Cost Ratio on (ReportingService.
// managementRatiosAndHealth) — everything else about the account behaves
// exactly like the standard ones the moment it's created.
export function NewAccountDialog({ fund }: { fund: Fund }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LedgerAccountType | "">("");
  const [isAdministrative, setIsAdministrative] = useState(false);
  const action = createLedgerAccountAction.bind(null, fund.id);
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) {
      setOpen(false);
      setType("");
      setIsAdministrative(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="print:hidden">
          <Plus aria-hidden />
          New account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account on {fund.name}</DialogTitle>
          <DialogDescription>
            Shows up immediately in every report that queries this fund&apos;s accounts — Trial Balance, the
            Income &amp; Expenditure Statement, and the Budget account picker all need no changes.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Account name</Label>
            <Input id="name" name="name" placeholder="e.g. Administrative Expenses" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Type</Label>
            <Select name="type" value={type} onValueChange={(v) => setType(v as LedgerAccountType)} required>
              <SelectTrigger id="type" className="w-full">
                <SelectValue placeholder="Choose an account type" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "EXPENSE" && (
            <label className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2.5 text-sm">
              <Checkbox
                name="isAdministrative"
                checked={isAdministrative}
                onCheckedChange={(checked) => setIsAdministrative(checked === true)}
              />
              <span>
                Administrative overhead
                <span className="block text-xs text-muted-foreground">
                  Separate from benefit payouts — required for Expense Ratio and Administrative Cost Ratio to
                  appear on Financial Health.
                </span>
              </span>
            </label>
          )}

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
                "Create account"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
