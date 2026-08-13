import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, HeartPulse, Info } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/finance/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { ManagementRatiosAndHealth } from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Financial Health — Welfare Platform",
};

const HEALTH_TONE: Record<ManagementRatiosAndHealth["financialHealth"], StatusTone> = {
  Healthy: "good",
  Watch: "warn",
  "At Risk": "warn",
  Critical: "bad",
};

function Ratio({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
        {value ?? <span className="text-lg text-muted-foreground">—</span>}
        {value && "%"}
      </p>
    </div>
  );
}

export default async function FinancialHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { token } = await requireSession();
  const { from, to } = await searchParams;

  const health = await apiFetchOrNull<ManagementRatiosAndHealth>(
    `/reports/financial-health${from || to ? "?" : ""}${[from ? `from=${from}` : "", to ? `to=${to}` : ""]
      .filter(Boolean)
      .join("&")}`,
    { token, cache: "no-store" },
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financial Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {health ? `${new Date(health.from).toLocaleDateString("en-GH")} to ${new Date(health.to).toLocaleDateString("en-GH")}` : ""}
        </p>
      </div>

      {!health ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-border/50 shadow-md">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                  <HeartPulse className="size-4" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overall status</p>
                  <StatusBadge
                    tone={HEALTH_TONE[health.financialHealth]}
                    label={health.financialHealth}
                    className="mt-1 text-sm"
                  />
                </div>
              </div>
              <p className="max-w-md text-sm text-muted-foreground">{health.reason}</p>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Management ratios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Ratio label="Collection rate" value={health.collectionRate} />
                <Ratio label="Arrears rate" value={health.arrearsRate} />
                <Ratio label="Benefit payout ratio" value={health.benefitPayoutRatio} />
                <Ratio label="Fund utilisation rate" value={health.fundUtilisationRate} />
                <Ratio label="Growth rate" value={health.growthRate} />
                <Ratio label="Expense ratio" value={health.expenseRatio} />
                <Ratio label="Administrative cost ratio" value={health.administrativeCostRatio} />
              </div>

              {health.notAvailable && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>{health.notAvailable}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
