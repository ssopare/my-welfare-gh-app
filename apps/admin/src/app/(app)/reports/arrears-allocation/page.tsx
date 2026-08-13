import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { ArrearsAllocationRow, Organisation } from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Arrears Allocation — Welfare Platform",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function ArrearsAllocationPage() {
  const { token } = await requireSession();

  const [organisation, rows] = await Promise.all([
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<ArrearsAllocationRow[]>("/reports/arrears-allocation", { token, cache: "no-store" }),
  ]);
  const currency = organisation?.currency ?? "GHS";
  const lateCount = rows?.filter((r) => r.daysLate > 0).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Arrears Allocation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every contribution payment, with the period it was actually for alongside the date cash was
          collected — a payment against an old arrear reads as late here even if this month&apos;s total looks
          fine.
        </p>
      </div>

      {!rows ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="size-4 text-status-warn" aria-hidden />
              Payments
              {lateCount > 0 && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({lateCount} paid late)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No contribution payments have been allocated to an obligation yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Member</TableHead>
                      <TableHead>Contribution period</TableHead>
                      <TableHead>Cash collected</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Days late</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={`${row.obligationId}-${i}`}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.phoneNumber ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(row.contributionPeriod)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(row.cashCollectionDate)}
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay value={row.amount} currency={currency} size="sm" />
                        </TableCell>
                        <TableCell className="text-right">
                          {row.daysLate > 0 ? (
                            <span className="font-mono text-sm font-medium text-status-warn">{row.daysLate}d</span>
                          ) : (
                            <span className="font-mono text-sm text-status-good">On time</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
