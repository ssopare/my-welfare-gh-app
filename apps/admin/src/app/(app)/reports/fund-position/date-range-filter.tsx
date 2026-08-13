"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Fund Position Report has no fund selector — it's always every fund at
// once (see ReportingService.fundPositionReport) — so this is just the
// date-range half of ReportFilterBar, not the whole thing.
export function DateRangeFilter({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (!value) params.delete(key);
    else params.set(key, value);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
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
