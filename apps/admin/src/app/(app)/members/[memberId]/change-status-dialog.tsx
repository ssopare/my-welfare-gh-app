"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
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
import { MEMBER_STATUSES, type MemberStatus } from "@welfare/shared-types";
import { MEMBER_STATUS_META } from "@/lib/status-meta";
import { changeMemberStatusAction, type ChangeStatusState } from "./actions";

const INITIAL_STATE: ChangeStatusState = { error: null };

// Financial/status-affecting actions earn a real confirmation, not a bare
// "Are you sure?" (see the admin UI design plan) — this states exactly
// what's about to change and lets the admin record why, since every
// transition already becomes a permanent MemberStatusChange audit row
// server-side.
export function ChangeStatusDialog({
  memberId,
  currentStatus,
}: {
  memberId: string;
  currentStatus: MemberStatus;
}) {
  const [open, setOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<MemberStatus>(currentStatus);
  const [reason, setReason] = useState("");
  const boundAction = changeMemberStatusAction.bind(null, memberId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  // Close the dialog once the action reports success — deriving this during
  // render (React's documented pattern for "reset state when some other
  // state changes") rather than in an effect, since a plain effect here
  // would fire a second, cascading render for a change React can already
  // fold into the one triggered by the action itself. A removal queued for
  // a second admin's confirmation stays open instead, showing that outcome
  // explicitly rather than closing as if it had already taken effect.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success && !state.pendingConfirmation) {
      setOpen(false);
    }
  }

  const isRemoval = nextStatus === "EXITED";
  const reasonMissing = isRemoval && !reason.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setNextStatus(currentStatus);
          setReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RefreshCw aria-hidden />
          Change status
        </Button>
      </DialogTrigger>
      <DialogContent>
        {state.success && state.pendingConfirmation ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-status-good" aria-hidden />
                Removal requested
              </DialogTitle>
              <DialogDescription>
                This organisation requires a second admin to confirm removals. The member&apos;s
                status hasn&apos;t changed yet — it won&apos;t, unless a different admin confirms
                this request from the pending removals queue.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Change member status</DialogTitle>
              <DialogDescription>
                Currently <strong>{MEMBER_STATUS_META[currentStatus].label}</strong>. This creates
                a permanent, timestamped record in the member&apos;s status history — it cannot be
                edited or removed afterward.
                {isRemoval && (
                  <>
                    {" "}
                    Removing is never permanent on its own — the member is unlisted from the
                    active roster, not deleted, and can be reinstated later by setting their
                    status back.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="status">New status</Label>
                <Select
                  name="status"
                  value={nextStatus}
                  onValueChange={(value) => setNextStatus(value as MemberStatus)}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {MEMBER_STATUS_META[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reason">Reason{isRemoval ? "" : " (optional)"}</Label>
                <Input
                  id="reason"
                  name="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required={isRemoval}
                  placeholder={
                    isRemoval
                      ? "Why is this member being removed?"
                      : "e.g. Confirmed by chapter convener"
                  }
                />
                {isRemoval && (
                  <p className="text-xs text-muted-foreground">
                    Required — removal is the most consequential status change a member can face.
                  </p>
                )}
              </div>

              {state.error && (
                <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
                  {state.error}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="submit"
                  variant={isRemoval ? "destructive" : "default"}
                  disabled={isPending || nextStatus === currentStatus || reasonMissing}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : isRemoval ? (
                    "Remove member"
                  ) : (
                    "Confirm change"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
