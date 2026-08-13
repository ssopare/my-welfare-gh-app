import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Undo2 } from "lucide-react";
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
import type { Organisation, ReversalsAndAdjustments } from "@welfare/shared-types";
import { DateRangeFilter } from "../fund-position/date-range-filter";

export const metadata: Metadata = {
  title: "Reversals & Adjustments — Welfare Platform",
};

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ReversalsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { token } = await requireSession();
  const { from, to } = await searchParams;
  const effectiveFrom = from || monthStart();
  const effectiveTo = to || today();

  const [organisation, report] = await Promise.all([
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<ReversalsAndAdjustments>(
      `/reports/reversals?from=${effectiveFrom}&to=${effectiveTo}`,
      { token, cache: "no-store" },
    ),
  ]);
  const currency = organisation?.currency ?? "GHS";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reversals &amp; Adjustments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every reversal is a real contra entry linked to what it reverses — nothing here was ever deleted.
        </p>
      </div>

      <DateRangeFilter basePath="/reports/reversals" />

      {!report ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-border/50 shadow-md">
            <CardContent className="flex flex-wrap items-center justify-between gap-6 py-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gross collection</p>
                <MoneyDisplay value={report.grossCollection} currency={currency} size="lg" className="mt-1" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Less reversals</p>
                <MoneyDisplay value={report.reversalsTotal} currency={currency} size="lg" className="mt-1" tone="warn" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net collection</p>
                <MoneyDisplay value={report.netCollection} currency={currency} size="lg" className="mt-1" tone="good" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Undo2 className="size-4 text-status-warn" aria-hidden />
                Reversal entries
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.reversals.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No entries were reversed in this period.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Reversed on</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Original entry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.reversals.map((row) => (
                        <TableRow key={row.journalEntryId}>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(row.postedAt)}
                          </TableCell>
                          <TableCell className="text-sm">{row.description}</TableCell>
                          <TableCell className="text-right">
                            <MoneyDisplay value={row.amount} currency={currency} size="sm" />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.originalDescription ?? "—"}
                            {row.originalPostedAt && (
                              <span className="block">{formatDateTime(row.originalPostedAt)}</span>
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
        </>
      )}
    </div>
  );
}
