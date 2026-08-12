"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Member } from "@welfare/shared-types";
import { generateObligationsAction, type GenerateObligationsState } from "../../actions";

const INITIAL_STATE: GenerateObligationsState = { error: null };

// Closes the one real gap left in the contribution loop: a plan and a
// fund can both exist, but nothing generates the per-member Obligation
// rows that actually put members on the hook for a due date — see
// generateObligationsAction's own comment for why this loops the
// existing single-member endpoint rather than adding a new bulk one.
export function GenerateObligationsForm({ planId, members }: { planId: string; members: Member[] }) {
  const [state, formAction, isPending] = useActionState(
    generateObligationsAction.bind(null, planId),
    INITIAL_STATE,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const phoneById = useMemo(
    () => new Map(members.map((m) => [m.id, m.account.phoneNumber])),
    [members],
  );

  function toggle(memberId: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(memberId);
    else next.delete(memberId);
    setSelectedIds(next);
  }

  const allSelected = members.length > 0 && selectedIds.size === members.length;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="dueDate">Due date</Label>
        <Input id="dueDate" name="dueDate" type="date" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label>Members ({selectedIds.size} selected)</Label>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setSelectedIds(allSelected ? new Set() : new Set(members.map((m) => m.id)))}
          >
            {allSelected ? "Clear all" : "Select all"}
          </Button>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members in this organisation yet.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60">
            <div className="flex flex-col divide-y divide-border">
              {members.map((member) => (
                <label key={member.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                  <Checkbox
                    name="memberIds"
                    value={member.id}
                    checked={selectedIds.has(member.id)}
                    onCheckedChange={(checked) => toggle(member.id, checked === true)}
                  />
                  <span className="font-mono tabular-nums">{member.account.phoneNumber}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
          {state.error}
        </p>
      )}

      {state.successCount !== undefined && (
        <div className="flex flex-col gap-2 rounded-md border border-status-good-border bg-status-good-bg px-3 py-2 text-sm text-status-good">
          <span>
            Created {state.successCount} obligation{state.successCount === 1 ? "" : "s"}
            {state.failures && state.failures.length > 0 ? `, ${state.failures.length} failed` : ""}.
          </span>
          {state.failures && state.failures.length > 0 && (
            <ul className="list-inside list-disc text-status-bad">
              {state.failures.map((failure) => (
                <li key={failure.memberId}>
                  {phoneById.get(failure.memberId) ?? failure.memberId}: {failure.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <Button type="submit" disabled={isPending || selectedIds.size === 0}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Generating…
            </>
          ) : (
            <>
              <CalendarPlus aria-hidden />
              Generate obligations
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
