"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaymentAllocationPolicy } from "@welfare/shared-types";
import { updatePaymentAllocationPolicyAction } from "./actions";

const OPTIONS: { value: PaymentAllocationPolicy; label: string; description: string }[] = [
  {
    value: "oldest_first",
    label: "Oldest due first (default)",
    description: "A payment automatically covers whichever open items are oldest, in order.",
  },
  {
    value: "member_selected",
    label: "Member chooses",
    description: "A member (or admin recording on their behalf) picks which open items a payment covers.",
  },
];

// No org-settings screen existed anywhere before this — this is the first
// write surface for anything on Organisation beyond what registration sets.
// Kept here, next to Record Payment, rather than a general settings page,
// since this is the one setting this slice actually needs an admin to
// reach; a real "organisation settings" screen is a separate, larger piece
// of work if more of these ever need a home.
export function PaymentAllocationSetting({ policy }: { policy: string }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticPolicy, setOptimisticPolicy] = useState(policy);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="paymentAllocationPolicy">How payments are applied</Label>
      <Select
        value={optimisticPolicy}
        disabled={isPending}
        onValueChange={(value) => {
          const next = value as PaymentAllocationPolicy;
          setOptimisticPolicy(next);
          startTransition(async () => {
            try {
              await updatePaymentAllocationPolicyAction(next);
            } catch (error) {
              setOptimisticPolicy(policy);
              toast.error(error instanceof Error ? error.message : "Something went wrong.");
            }
          });
        }}
      >
        <SelectTrigger id="paymentAllocationPolicy" className="w-full sm:w-80">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {OPTIONS.find((o) => o.value === optimisticPolicy)?.description}
      </p>
    </div>
  );
}
