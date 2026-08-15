import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { AgingHeatmap } from "@/components/defaulters/aging-heatmap";
import { MoneyDisplay } from "@/components/finance/money-display";
import { StatusBadge } from "@/components/finance/status-badge";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { requireSession } from "@/lib/session";
import { MEMBER_STATUS_META } from "@/lib/status-meta";
import type { DefaulterPolicy, DefaulterRegisterRow, Organisation } from "@welfare/shared-types";
import { reassessAction } from "./actions";
import { PolicyDialog } from "./policy-dialog";

export const metadata: Metadata = {
  title: "Defaulters — Welfare Platform",
};

export default async function DefaultersPage() {
  const { token } = await requireSession();

  const [rows, policy, organisation] = await Promise.all([
    apiFetchOrNull<DefaulterRegisterRow[]>("/reports/defaulter-register", { token, cache: "no-store" }),
    apiFetchOrNull<DefaulterPolicy>("/defaulter-policy", { token, cache: "no-store" }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
  ]);
  const currency = organisation?.currency ?? "GHS";

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Defaulters"
        subtitle="Members in arrears, with how long each period has been outstanding."
        icon={AlertTriangle}
        theme="amber"
        rightAction={<PolicyDialog policy={policy ?? null} />}
      />

      {policy && (
        <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
          <CardContent className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-status-warn" aria-hidden />
              <span className="text-sm text-muted-foreground">
                Defaulter at <strong className="text-foreground">{policy.defaulterThresholdMonths}</strong> missed period
                {policy.defaulterThresholdMonths === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-status-bad" aria-hidden />
              <span className="text-sm text-muted-foreground">
                Suspended at <strong className="text-foreground">{policy.forfeitureThresholdMonths}</strong> missed period
                {policy.forfeitureThresholdMonths === 1 ? "" : "s"}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
        <CardHeader>
          <CardTitle className="text-base">Arrears aging</CardTitle>
        </CardHeader>
        <CardContent>
          {!rows ? (
            <p className="py-10 text-center text-sm text-muted-foreground">You don&apos;t have access to this report.</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No members are currently in default — everyone is in good standing.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <li
                  key={`${row.memberId}-${row.contributionPlanId}`}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 sm:w-56 sm:shrink-0">
                    <Link href={`/members/${row.memberId}`} className="truncate font-mono text-sm hover:underline">
                      {row.phoneNumber ?? row.memberId}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge {...MEMBER_STATUS_META[row.status]} />
                      {row.planName && <span className="truncate text-xs text-muted-foreground">{row.planName}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.consecutiveMissedCount} consecutive missed period{row.consecutiveMissedCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="sm:w-64 sm:shrink-0">
                    <AgingHeatmap buckets={row.agingBuckets} currency={currency} />
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:w-40 sm:shrink-0 sm:justify-end">
                    <MoneyDisplay value={row.arrearsOwed} currency={currency} tone="bad" />
                    <AsyncActionButton
                      label="Reassess"
                      action={reassessAction.bind(null, row.memberId, row.contributionPlanId)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
