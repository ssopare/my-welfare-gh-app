import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, UserCheck } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { ManualPaymentReportRow } from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Manually Recorded Payments — Welfare Platform",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ManualPaymentsReportPage() {
  const { token } = await requireSession();
  const rows = await apiFetchOrNull<ManualPaymentReportRow[]>("/reports/manual-payments", {
    token,
    cache: "no-store",
  });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manually recorded payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every contribution an admin or treasurer personally attested was received — not a payment Paystack
          independently confirmed. Who recorded it, for whom, and when.
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-status-warn-border bg-status-warn-bg/25 px-4 py-3 text-sm text-status-warn">
        <ShieldAlert className="size-4 shrink-0 mt-0.5" />
        <p>
          These payments were never verified by the payment provider — the system is trusting whoever recorded
          them. This report exists so that trust is visible and reviewable, not to change who&apos;s allowed to
          record one.
        </p>
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Manual attestations</CardTitle>
        </CardHeader>
        <CardContent>
          {!rows ? (
            <p className="py-10 text-center text-sm text-muted-foreground">You don&apos;t have access to this report.</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No manually recorded payments — every contribution so far was verified by the payment provider.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <li key={row.journalEntryId} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium">{row.memberName ?? row.memberPhoneNumber}</p>
                    <p className="text-xs text-muted-foreground">{row.planName} · {formatDateTime(row.postedAt)}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <UserCheck className="size-3.5" aria-hidden />
                      Recorded by {row.recordedByName ?? row.recordedByPhoneNumber ?? "Unknown"}
                    </p>
                  </div>
                  <MoneyDisplay value={row.amountValue} currency="GHS" size="sm" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
