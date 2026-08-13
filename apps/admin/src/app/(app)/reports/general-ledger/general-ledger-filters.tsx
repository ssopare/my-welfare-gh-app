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

// General Ledger is per-account, not per-fund — the account picker groups
// every fund's accounts under that fund's name, distinct from the fund-only
// selector the other Phase A reports use (ReportFilterBar).
export function GeneralLedgerFilters({ funds }: { funds: Fund[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = searchParams.get("accountId") ?? "";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (!value) params.delete(key);
    else params.set(key, value);
    router.push(`/reports/general-ledger?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Account</Label>
        <Select value={accountId} onValueChange={(value) => updateParam("accountId", value)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Choose an account" />
          </SelectTrigger>
          <SelectContent>
            {funds.map((fund) => (
              <div key={fund.id}>
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{fund.name}</p>
                {fund.ledgerAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>
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
    </div>
  );
}
