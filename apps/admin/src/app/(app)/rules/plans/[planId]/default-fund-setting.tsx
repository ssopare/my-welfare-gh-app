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
import type { Fund } from "@welfare/shared-types";
import { setPlanDefaultFundAction } from "../../actions";

// Every payment record/pay screen suggests a fund by reading this field off
// the member's open obligations — so an unset default here is exactly why a
// monthly-dues payment can land in the wrong fund by default. Plans created
// before this field existed have it null; this is how an admin fixes one
// after the fact, without going through full plan versioning (see the
// backend comment on ContributionPlanService.setDefaultFund).
export function DefaultFundSetting({
  planId,
  fundId,
  funds,
}: {
  planId: string;
  fundId: string | null;
  funds: Fund[];
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticFundId, setOptimisticFundId] = useState(fundId ?? "");

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="defaultFundId">Default fund</Label>
      <Select
        value={optimisticFundId}
        disabled={isPending}
        onValueChange={(value) => {
          setOptimisticFundId(value);
          startTransition(async () => {
            try {
              await setPlanDefaultFundAction(planId, value);
              toast.success("Default fund updated.");
            } catch (error) {
              setOptimisticFundId(fundId ?? "");
              toast.error(error instanceof Error ? error.message : "Something went wrong.");
            }
          });
        }}
      >
        <SelectTrigger id="defaultFundId" className="w-full sm:w-80">
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          {funds.map((fund) => (
            <SelectItem key={fund.id} value={fund.id}>
              {fund.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {optimisticFundId
          ? "Payments against this plan's obligations will suggest this fund automatically."
          : "Not set — payment screens won't auto-suggest a fund for this plan's dues."}
      </p>
    </div>
  );
}
