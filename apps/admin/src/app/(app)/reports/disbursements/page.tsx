import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Banknote, CheckCircle2, XCircle } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { DisbursementReportRow } from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Disbursement Report — Welfare Platform",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function DisbursementReportPage() {
  const { token } = await requireSession();
  const rows = await apiFetchOrNull<DisbursementReportRow[]>("/reports/disbursements", { token, cache: "no-store" });

  const total = rows?.reduce((sum, row) => sum + Number.parseFloat(row.amountValue), 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Disbursement report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every paid benefit claim, with its full approver trail.</p>
        </div>
        {rows && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/55 px-4 py-2 backdrop-blur-xl">
            <Banknote className="size-4 text-primary" aria-hidden />
            <span className="text-sm text-muted-foreground">Total disbursed</span>
            <MoneyDisplay value={total} currency={rows[0]?.currency ?? "GHS"} tone="good" />
          </div>
        )}
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Paid claims</CardTitle>
        </CardHeader>
        <CardContent>
          {!rows ? (
            <p className="py-10 text-center text-sm text-muted-foreground">You don&apos;t have access to this report.</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No benefits have been disbursed yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <li key={row.claimId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link href={`/claims/${row.claimId}`} className="font-medium hover:underline">
                        {row.benefitName}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">{row.phoneNumber}</p>
                    </div>
                    <div className="text-right">
                      <MoneyDisplay value={row.amountValue} currency={row.currency} tone="good" />
                      {row.paidAt && <p className="text-xs text-muted-foreground">{formatDate(row.paidAt)}</p>}
                    </div>
                  </div>

                  {row.approverTrail.length > 0 && (
                    <ul className="flex flex-wrap gap-2 pl-1">
                      {row.approverTrail.map((approval, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          {approval.decision === "APPROVE" ? (
                            <CheckCircle2 className="size-3 text-status-good" aria-hidden />
                          ) : (
                            <XCircle className="size-3 text-status-bad" aria-hidden />
                          )}
                          {approval.stageName}
                          {approval.actorPhoneNumber && (
                            <span className="font-mono">· {approval.actorPhoneNumber}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
