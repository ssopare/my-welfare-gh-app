"use client";

import { useActionState } from "react";
import { Loader2, CheckCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettlementAccount } from "@welfare/shared-types";
import { saveSettlementAccountAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

export function SettlementForm({ settlement }: { settlement: SettlementAccount | null }) {
  const [state, formAction, isPending] = useActionState(saveSettlementAccountAction, INITIAL_STATE);

  return (
    <div className="space-y-4">
      {settlement ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm rounded-lg border border-border bg-muted/30 p-4">
            <span className="text-muted-foreground">Bank/Network:</span>
            <span className="font-semibold">{settlement.bankName}</span>
            <span className="text-muted-foreground">Account Number:</span>
            <span className="font-semibold">{settlement.accountNumber}</span>
            <span className="text-muted-foreground">Subaccount Code:</span>
            <span className="font-mono text-xs">{settlement.providerSubaccountCode}</span>
            <span className="text-muted-foreground">Verification Status:</span>
            {settlement.verified ? (
              <span className="flex items-center gap-1 font-semibold text-status-good">
                <CheckCircle className="size-4" /> Verified
              </span>
            ) : (
              <span className="flex items-center gap-1 font-semibold text-status-warn">
                <ShieldAlert className="size-4" /> Not yet verified
              </span>
            )}
          </div>
          {!settlement.verified && (
            <p className="text-xs text-status-warn">
              This settlement account hasn&apos;t been verified with the payment provider yet — incoming
              contributions won&apos;t be routed to it until verification is complete.
            </p>
          )}
          <p className="text-xs text-muted-foreground italic">
            To update settlement routing, re-submit the configuration details below.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-status-warn-border bg-status-warn-bg/25 px-3 py-2 text-sm text-status-warn">
          <ShieldAlert className="size-4 shrink-0" />
          <span>No settlement account configured. Incoming payment splits and outgoing payouts are disabled.</span>
        </div>
      )}

      <form action={formAction} className="space-y-4 border-t border-border/60 pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankName">Bank / Provider Name</Label>
            <Input id="bankName" name="bankName" placeholder="e.g. MTN Mobile Money" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountNumber">Account Number</Label>
            <Input id="accountNumber" name="accountNumber" placeholder="e.g. 0559998887" required />
          </div>
        </div>

        {state.error && (
          <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
            {state.error}
          </p>
        )}

        <Button type="submit" variant="outline" size="sm" className="w-full sm:w-auto" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin mr-1.5 size-4" />
              Saving…
            </>
          ) : (
            "Save Settlement Details"
          )}
        </Button>
      </form>
    </div>
  );
}
