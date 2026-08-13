"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContributionPlan } from "@welfare/shared-types";

const ALL_PLANS = "__all__";

export function FilterBar({ plans }: { plans: ContributionPlan[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId") ?? ALL_PLANS;

  function setPlan(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === ALL_PLANS) params.delete("planId");
    else params.set("planId", value);
    router.push(`/reports/contributions?${params.toString()}`);
  }

  return (
    <Select value={planId} onValueChange={setPlan}>
      <SelectTrigger className="w-56 print:hidden">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PLANS}>All plans</SelectItem>
        {plans.map((plan) => (
          <SelectItem key={plan.id} value={plan.id}>
            {plan.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
