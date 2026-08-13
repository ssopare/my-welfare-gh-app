import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
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
import type { Fund, GeneralLedgerReport, Organisation } from "@welfare/shared-types";
import { GeneralLedgerFilters } from "./general-ledger-filters";

export const metadata: Metadata = {
  title: "General Ledger — Welfare Platform",
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

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; from?: string; to?: string }>;
}) {
  const { token } = await requireSession();
  const { accountId, from, to } = await searchParams;

  const [funds, organisation, gl] = await Promise.all([
    apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    accountId
      ? apiFetchOrNull<GeneralLedgerReport>(
          `/reports/general-ledger/${accountId}${from || to ? "?" : ""}${[
            from ? `from=${from}` : "",
            to ? `to=${to}` : "",
          ]
            .filter(Boolean)
            .join("&")}`,
          { token, cache: "no-store" },
        )
      : Promise.resolve(null),
  ]);
  const currency = organisation?.currency ?? "GHS";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">General Ledger</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every line posted to one account, with a running balance.</p>
      </div>

      {funds && <GeneralLedgerFilters funds={funds} />}

      {!accountId ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Choose an account above to see its ledger.
          </CardContent>
        </Card>
      ) : !gl ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 text-primary" aria-hidden />
              {gl.fundName} — {gl.accountName}
            </CardTitle>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Opening</span>
              <MoneyDisplay value={gl.openingBalance} currency={currency} size="sm" />
              <span className="text-muted-foreground">Closing</span>
              <MoneyDisplay value={gl.closingBalance} currency={currency} size="sm" />
            </div>
          </CardHeader>
          <CardContent>
            {gl.entries.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No entries in this range.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Running balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gl.entries.map((entry) => (
                      <TableRow key={entry.journalEntryId}>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(entry.date)}</TableCell>
                        <TableCell className="max-w-md truncate text-sm">
                          {entry.description}
                          {entry.isReversal && (
                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Reversal
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.debit !== "0" && <MoneyDisplay value={entry.debit} currency={currency} size="sm" />}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.credit !== "0" && <MoneyDisplay value={entry.credit} currency={currency} size="sm" />}
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay value={entry.runningBalance} currency={currency} size="sm" />
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
