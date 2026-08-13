"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Fund } from "@welfare/shared-types";

const ALL_FUNDS = "__all__";

// Shared across the Phase A reports (Income & Expenditure, Trial Balance,
// General Ledger) — same URL-searchParams-driven pattern as the existing
// reports/contributions/filter-bar.tsx, just with a fund selector and an
// optional date range instead of a single plan selector. A page opts out
// of the date range (Trial Balance uses a single "as of" date instead,
// handled on that page directly) via showDateRange.
export function ReportFilterBar({
  funds,
  basePath,
  showDateRange = true,
}: {
  funds: Fund[];
  basePath: string;
  showDateRange?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fundId = searchParams.get("fundId") ?? ALL_FUNDS;

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (!value || value === ALL_FUNDS) params.delete(key);
    else params.set(key, value);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Fund</Label>
        <Select value={fundId} onValueChange={(value) => updateParam("fundId", value)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FUNDS}>All funds</SelectItem>
            {funds.map((fund) => (
              <SelectItem key={fund.id} value={fund.id}>
                {fund.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showDateRange && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              defaultValue={searchParams.get("from") ?? ""}
              className="w-40"
              onBlur={(e) => updateParam("from", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              defaultValue={searchParams.get("to") ?? ""}
              className="w-40"
              onBlur={(e) => updateParam("to", e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}
