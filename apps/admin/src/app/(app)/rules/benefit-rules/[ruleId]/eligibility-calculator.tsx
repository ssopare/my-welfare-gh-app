"use client";

import { useActionState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { EligibilityChecklist } from "@/components/rules/eligibility-checklist";
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
import { evaluateEligibilityPreviewAction, type EligibilityPreviewState } from "../../actions";

const INITIAL_STATE: EligibilityPreviewState = { error: null };

// The design plan's single biggest payoff: the backend has carried the
// checks[] explainable trace since the rule-engine slice, with no UI to
// show it until now. This form calls the real evaluate-eligibility
// endpoint against a sample member and renders the actual trace.
export function EligibilityCalculator({ ruleId, members }: { ruleId: string; members: Member[] }) {
  const [state, formAction, isPending] = useActionState(
    evaluateEligibilityPreviewAction.bind(null, ruleId),
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
          <Label htmlFor="eventDate">Event date</Label>
          <Input id="eventDate" name="eventDate" type="date" required />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          Check eligibility
        </Button>
      </form>

      {state.error && (
        <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
          {state.error}
        </p>
      )}

      {state.result && <EligibilityChecklist result={state.result} />}
    </div>
  );
}
