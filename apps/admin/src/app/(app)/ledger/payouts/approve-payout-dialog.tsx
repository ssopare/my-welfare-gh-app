"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
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
import { approvePayoutRequestAction } from "./actions";

export function ApprovePayoutDialog({
  requestId,
  amountValue,
  currency,
  purpose,
}: {
  requestId: string;
  amountValue: string;
  currency: string;
  purpose: string;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDecision(decision: "APPROVED" | "REJECTED") {
    setError(null);
    startTransition(async () => {
      const result = await approvePayoutRequestAction(requestId, decision, comment);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setComment("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-primary/30 text-primary hover:bg-primary/5">
          Approve/Reject
        </Button>
      </DialogTrigger>
      <DialogContent suppressHydrationWarning>
        <DialogHeader>
          <DialogTitle>Evaluate Payout Request</DialogTitle>
          <DialogDescription>
            Confirm or reject the disbursement of <span className="font-semibold text-foreground">{currency} {amountValue}</span> for &ldquo;{purpose}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comment">Decision Comment</Label>
            <Input
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Approved medical support payout."
              disabled={isPending}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
              {error}
            </p>
          )}

          <DialogFooter className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-status-bad-border hover:bg-status-bad-bg text-status-bad font-semibold"
              disabled={isPending}
              onClick={() => handleDecision("REJECTED")}
            >
              {isPending ? (
                <Loader2 className="animate-spin size-4" />
              ) : (
                <>
                  <XCircle className="mr-1.5 size-4" />
                  Reject
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="default"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={isPending}
              onClick={() => handleDecision("APPROVED")}
            >
              {isPending ? (
                <Loader2 className="animate-spin size-4" />
              ) : (
                <>
                  <CheckCircle className="mr-1.5 size-4" />
                  Approve
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
