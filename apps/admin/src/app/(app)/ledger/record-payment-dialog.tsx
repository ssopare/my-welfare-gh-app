"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
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
import type { Fund, Member, Obligation, Organisation } from "@welfare/shared-types";
import { listOpenObligationsAction, recordPaymentAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

function outstanding(obligation: Obligation): string {
  return (Number.parseFloat(obligation.amountValue) - Number.parseFloat(obligation.amountPaid)).toFixed(2);
}

// A treasurer manually recording a contribution they've already collected
// (cash, mobile money handed over in person) — not the async
// initiate/webhook payment-provider flow, which is a mobile-app concern.
// Posts a real, balanced journal entry the moment this succeeds — no
// "are you sure" needed here (unlike a reversal) since recording a real
// payment that happened is the whole point, not a destructive action.
export function RecordPaymentDialog({
  funds,
  members,
  organisation,
}: {
  funds: Fund[];
  members: Member[];
  organisation: Organisation | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(recordPaymentAction, INITIAL_STATE);
  // useActionState's state outlives the dialog's own open/close (this
  // component never unmounts, only DialogContent does) — without this,
  // a failed attempt's error banner would keep showing verbatim after
  // closing and reopening, or after changing fields to try again,
  // making a fresh attempt look like it's stuck on the old one.
  const [errorDismissed, setErrorDismissed] = useState(false);

  const currency = organisation?.currency ?? "GHS";
  const [memberId, setMemberId] = useState("");
  const [fundId, setFundId] = useState("");
  const [openObligations, setOpenObligations] = useState<Obligation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoadingObligations, startLoadingObligations] = useTransition();
  const [typedAmount, setTypedAmount] = useState("");

  function resetForm() {
    setMemberId("");
    setFundId("");
    setOpenObligations([]);
    setSelectedIds(new Set());
    setTypedAmount("");
    setErrorDismissed(true);
  }

  // Monthly dues are never individually pickable — they're always applied
  // automatically, oldest-first (with overpayment spreading into future
  // months), regardless of the org's policy. See
  // recordContributionPaymentInTx's own phase comments on the API side.
  const monthlyObligations = openObligations.filter((o) => o.contributionPlan?.cadence === "monthly");
  const otherObligations = openObligations.filter((o) => o.contributionPlan?.cadence !== "monthly");
  const monthlyTotal = monthlyObligations.reduce((sum, o) => sum + Number.parseFloat(outstanding(o)), 0);
  const selectedOtherTotal = otherObligations
    .filter((o) => selectedIds.has(o.id))
    .reduce((sum, o) => sum + Number.parseFloat(outstanding(o)), 0);

  // Selecting which one-time items to cover is available regardless of
  // the org's policy now — that policy only ever governs whether a
  // selection is *required*, not whether one is *allowed*. Mirrors the
  // mobile app's PayScreen (_selectionRequired).
  const selectionRequired =
    organisation?.paymentAllocationPolicy === "member_selected" && otherObligations.length > 0;

  function handleMemberChange(value: string) {
    setMemberId(value);
    setSelectedIds(new Set());
    setErrorDismissed(true);
    startLoadingObligations(async () => {
      const obligations = await listOpenObligationsAction(value);
      setOpenObligations(obligations);
      // Suggests the fund whichever plan is actually owed against —
      // previously nothing did this, which is exactly how a routine
      // monthly-dues payment could end up posted to an unrelated one-off
      // fund. Still just a suggestion: the admin can pick a different one.
      const suggestedFundId = obligations.find((o) => o.contributionPlan?.defaultFundId)
        ?.contributionPlan?.defaultFundId;
      if (suggestedFundId) setFundId(suggestedFundId);
      const suggestedMonthlyTotal = obligations
        .filter((o) => o.contributionPlan?.cadence === "monthly")
        .reduce((sum, o) => sum + Number.parseFloat(outstanding(o)), 0);
      setTypedAmount(suggestedMonthlyTotal > 0 ? suggestedMonthlyTotal.toFixed(2) : "");
    });
  }

  function toggleObligation(obligation: Obligation, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(obligation.id);
    else next.delete(obligation.id);
    setSelectedIds(next);
    const nextSelectedOtherTotal = otherObligations
      .filter((o) => next.has(o.id))
      .reduce((sum, o) => sum + Number.parseFloat(outstanding(o)), 0);
    setTypedAmount((monthlyTotal + nextSelectedOtherTotal).toFixed(2));
    setErrorDismissed(true);
  }

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    // A genuinely new result just arrived (success or a fresh error) —
    // show it, overriding any earlier dismissal.
    setErrorDismissed(false);
    if (state.success) {
      setOpen(false);
      resetForm();
    }
  }

  // Mirrors what recordPaymentAction itself requires, checked client-side
  // so the submit button reflects reality instead of the user finding out
  // only after a round trip. Monthly dues alone are enough to submit —
  // nothing needs to be checked if that's all a member owes (see the
  // "member_selected: with only monthly obligations open" test on the
  // API side). Only a ceiling once something's actually been picked —
  // with nothing selected, any amount is fair game.
  const typedAmountValue = Number.parseFloat(typedAmount || "0");
  const exceedsSelection = selectedIds.size > 0 && typedAmountValue > monthlyTotal + selectedOtherTotal + 0.005;
  const canSubmit =
    Boolean(memberId) &&
    Boolean(fundId) &&
    typedAmountValue > 0 &&
    !(selectionRequired && selectedIds.size === 0) &&
    !exceedsSelection;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a contribution payment</DialogTitle>
          <DialogDescription>
            Monthly dues are always covered first, oldest due date first. Optionally choose which
            one-time items this payment also covers — posted as a balanced journal entry
            immediately.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="memberId">Member</Label>
            <Select name="memberId" value={memberId} onValueChange={handleMemberChange}>
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

          {memberId && (
            <div className="flex flex-col gap-3">
              {isLoadingObligations ? (
                <p className="text-sm text-muted-foreground">Loading open items…</p>
              ) : openObligations.length === 0 ? (
                <p className="text-sm text-muted-foreground">This member has no open items.</p>
              ) : (
                <>
                  {monthlyObligations.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label>Monthly dues (applied automatically)</Label>
                      <div className="flex flex-col divide-y divide-border rounded-lg border border-border/60 bg-muted/40">
                        {monthlyObligations.map((obligation) => (
                          <div key={obligation.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                            <span className="text-muted-foreground">{formatDate(obligation.dueDate)}</span>
                            <MoneyDisplay value={outstanding(obligation)} currency={obligation.currency} size="sm" />
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Always covered first, oldest due date first — this isn&apos;t something you choose.
                      </p>
                    </div>
                  )}

                  {otherObligations.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Other contributions (optionally choose which to cover)</Label>
                        {selectedIds.size > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Selected: <MoneyDisplay value={selectedOtherTotal.toFixed(2)} currency="GHS" size="sm" />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col divide-y divide-border rounded-lg border border-border/60">
                        {otherObligations.map((obligation) => (
                          <label
                            key={obligation.id}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                          >
                            <span className="flex items-center gap-2">
                              <Checkbox
                                name="obligationIds"
                                value={obligation.id}
                                checked={selectedIds.has(obligation.id)}
                                onCheckedChange={(checked) => toggleObligation(obligation, checked === true)}
                              />
                              {obligation.contributionPlan?.name ?? formatDate(obligation.dueDate)}
                            </span>
                            <MoneyDisplay value={outstanding(obligation)} currency={obligation.currency} size="sm" />
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectionRequired
                          ? "This organisation requires selecting which items a payment covers."
                          : "Leave nothing checked to pay everything open, oldest-due first."}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fundId">Fund</Label>
            <Select
              name="fundId"
              value={fundId}
              onValueChange={(value) => {
                setFundId(value);
                setErrorDismissed(true);
              }}
            >
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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Currency</Label>
              {/* Ghana-only, GHS-only platform — this was previously free
                  text with no validation, letting anything through. Fixed
                  value from the organisation, not something an admin
                  should ever need to type. */}
              <Input
                id="currency"
                name="currency"
                value={currency}
                readOnly
                className="cursor-not-allowed bg-muted text-muted-foreground"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amountValue">Amount</Label>
              <Input
                id="amountValue"
                name="amountValue"
                inputMode="decimal"
                placeholder="e.g. 20.00"
                required
                value={typedAmount}
                onChange={(event) => {
                  setTypedAmount(event.target.value);
                  setErrorDismissed(true);
                }}
              />
            </div>
          </div>
          {exceedsSelection && (
            <p className="-mt-2 text-xs text-status-bad">
              Amount can&apos;t exceed the total of what&apos;s selected above.
            </p>
          )}
          {selectedIds.size > 0 && !exceedsSelection && typedAmountValue < monthlyTotal + selectedOtherTotal - 0.005 && (
            <p className="-mt-2 text-xs text-muted-foreground">
              This won&apos;t fully cover everything selected — it&apos;ll be applied oldest-due
              first among what&apos;s checked (monthly dues are still covered first,
              automatically).
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input id="reference" name="reference" placeholder="e.g. Mobile money receipt #1234" />
          </div>

          {state.error && !errorDismissed && (
            <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Recording…
                </>
              ) : (
                "Record payment"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
