"use client";

import { useActionState } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Member } from "@welfare/shared-types";
import { computeObligationPreviewAction, type ObligationPreviewState } from "../../actions";

const INITIAL_STATE: ObligationPreviewState = { error: null };

// The live-preview panel from the design plan: shows the *effect* of a
// plan against a real member before it ever matters, using the actual
// compute-obligation endpoint — not a guess at what the numbers would be.
export function ObligationCalculator({ planId, members }: { planId: string; members: Member[] }) {
  const [state, formAction, isPending] = useActionState(
    computeObligationPreviewAction.bind(null, planId),
    INITIAL_STATE,
  );

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="memberId">Member</Label>
          <Select name="memberId">
            <SelectTrigger id="memberId" className="w-full">
              <SelectValue placeholder="Choose a member" />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.account.phoneNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="periodDate">Period date</Label>
          <Input id="periodDate" name="periodDate" type="date" required />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Calculator aria-hidden />}
          Calculate
        </Button>
      </form>

      {state.error && (
        <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
          {state.error}
        </p>
      )}

      {state.result && (
        <div className="flex items-center justify-between rounded-lg border border-status-good-border bg-status-good-bg px-4 py-3">
          <span className="text-sm text-status-good">Amount owed for this period</span>
          <MoneyDisplay value={state.result.amount} currency={state.result.currency} tone="good" size="lg" />
        </div>
      )}
    </div>
  );
}
