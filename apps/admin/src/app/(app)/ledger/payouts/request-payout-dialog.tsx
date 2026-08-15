"use client";

import { useActionState, useState } from "react";
import { Loader2, Send } from "lucide-react";
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
import type { Fund, PayoutRecipient, Organisation } from "@welfare/shared-types";
import { createPayoutRequestAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

export function RequestPayoutDialog({
  recipients,
  funds,
  organisation,
  className,
}: {
  recipients: PayoutRecipient[];
  funds: Fund[];
  organisation: Organisation;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createPayoutRequestAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  const currency = organisation?.currency ?? "GHS";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className={className} disabled={recipients.length === 0 || funds.length === 0}>
          <Send className="mr-1.5 size-4" />
          Request Payout
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Payout</DialogTitle>
          <DialogDescription>
            Submit a new payout disbursement request. The request will undergo Maker-Checker verification and multi-stage officer approvals.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipientId">Verified Recipient</Label>
            <select
              id="recipientId"
              name="recipientId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background"
              required
            >
              <option value="">Select recipient...</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.bankCode} · {r.accountNumber})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fundId">Deduct From Fund</Label>
            <select
              id="fundId"
              name="fundId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background"
              required
            >
              <option value="">Select fund...</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amountValue">Amount ({currency})</Label>
            <Input
              id="amountValue"
              name="amountValue"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purpose">Purpose / Description</Label>
            <Input
              id="purpose"
              name="purpose"
              placeholder="e.g. Welfare hospitalization support"
              required
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
                  <Loader2 className="animate-spin mr-1.5 size-4" />
                  Submitting…
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
