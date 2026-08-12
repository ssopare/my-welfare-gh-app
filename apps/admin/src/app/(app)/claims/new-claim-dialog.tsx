"use client";

import { useActionState, useState } from "react";
import { FilePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { EligibilityChecklist } from "@/components/rules/eligibility-checklist";
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
import type { BenefitRule, Member } from "@welfare/shared-types";
import { submitClaimAction, type SubmitClaimState } from "./actions";

const INITIAL_STATE: SubmitClaimState = { error: null };

export function NewClaimDialog({ rules, members }: { rules: BenefitRule[]; members: Member[] }) {
  const [open, setOpen] = useState(false);
  const [ruleId, setRuleId] = useState<string>(rules[0]?.id ?? "");
  const [evidenceRows, setEvidenceRows] = useState<{ evidenceType: string; description: string }[]>([]);
  const boundAction = submitClaimAction.bind(null, ruleId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) {
      setOpen(false);
      setEvidenceRows([]);
    }
  }

  const selectedRule = rules.find((r) => r.id === ruleId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FilePlus aria-hidden />
          New claim
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit a claim</DialogTitle>
          <DialogDescription>
            Checked against the real eligibility rules immediately — an ineligible claim is rejected with the reason, not just an error.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ruleId">Benefit</Label>
            <Select value={ruleId} onValueChange={setRuleId}>
              <SelectTrigger id="ruleId" className="w-full">
                <SelectValue placeholder="Choose a benefit" />
              </SelectTrigger>
              <SelectContent>
                {rules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRule && selectedRule.evidenceRequired.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Requires evidence: {selectedRule.evidenceRequired.join(", ")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eventDate">Event date</Label>
            <Input id="eventDate" name="eventDate" type="date" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Evidence (optional)</Label>
            {evidenceRows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label="Evidence type"
                  placeholder="type (e.g. death_certificate)"
                  value={row.evidenceType}
                  onChange={(e) =>
                    setEvidenceRows((prev) =>
                      prev.map((r, i) => (i === index ? { ...r, evidenceType: e.target.value } : r)),
                    )
                  }
                  className="flex-1"
                />
                <Input
                  aria-label="Description"
                  placeholder="description"
                  value={row.description}
                  onChange={(e) =>
                    setEvidenceRows((prev) =>
                      prev.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)),
                    )
                  }
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEvidenceRows((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="text-muted-foreground" aria-hidden />
                  <span className="sr-only">Remove evidence</span>
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setEvidenceRows((prev) => [...prev, { evidenceType: "", description: "" }])}
            >
              <Plus aria-hidden />
              Add evidence
            </Button>
          </div>

          <input
            type="hidden"
            name="evidenceJson"
            value={JSON.stringify(evidenceRows.filter((r) => r.evidenceType && r.description))}
          />

          {state.error && (
            <div className="flex flex-col gap-3">
              <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
                {state.error}
              </p>
              {state.checks && <EligibilityChecklist result={{ eligible: false, checks: state.checks }} />}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending || !ruleId}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Submitting…
                </>
              ) : (
                "Submit claim"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
