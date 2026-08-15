"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FundControlPolicy } from "@welfare/shared-types";
import { savePolicyAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

export function PolicyForm({
  policy,
  currency,
}: {
  policy: FundControlPolicy | null;
  currency: string;
}) {
  const [state, formAction, isPending] = useActionState(savePolicyAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dailyLimitValue">Daily Cumulative Limit ({currency})</Label>
          <Input
            id="dailyLimitValue"
            name="dailyLimitValue"
            type="number"
            step="0.01"
            defaultValue={policy?.dailyLimitValue ?? "1000.00"}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="monthlyLimitValue">Monthly Cumulative Limit ({currency})</Label>
          <Input
            id="monthlyLimitValue"
            name="monthlyLimitValue"
            type="number"
            step="0.01"
            defaultValue={policy?.monthlyLimitValue ?? "5000.00"}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="thresholdOneApproverValue">Threshold for 2 Checkers ({currency})</Label>
          <Input
            id="thresholdOneApproverValue"
            name="thresholdOneApproverValue"
            type="number"
            step="0.01"
            defaultValue={policy?.thresholdOneApproverValue ?? "500.00"}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="thresholdTwoApproversValue">Threshold for 3 Checkers ({currency})</Label>
          <Input
            id="thresholdTwoApproversValue"
            name="thresholdTwoApproversValue"
            type="number"
            step="0.01"
            defaultValue={policy?.thresholdTwoApproversValue ?? "5000.00"}
            required
          />
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
          "Save Policy Gating"
        )}
      </Button>
    </form>
  );
}
