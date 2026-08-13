import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Scale } from "lucide-react";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
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
import type { Fund, Organisation, TrialBalance } from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Trial Balance — Welfare Platform",
};

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ fundId?: string; asOf?: string }>;
}) {
  const { token } = await requireSession();
  const { fundId, asOf } = await searchParams;

  const [funds, organisation, trialBalance] = await Promise.all([
    apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<TrialBalance>(
      `/reports/trial-balance${fundId || asOf ? "?" : ""}${[
        fundId ? `fundId=${fundId}` : "",
        asOf ? `asOf=${asOf}` : "",
      ]
        .filter(Boolean)
        .join("&")}`,
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
        <h1 className="text-2xl font-semibold tracking-tight">Trial Balance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every ledger account&apos;s net balance{trialBalance ? `, as of ${new Date(trialBalance.asOf).toLocaleString("en-GH")}` : ""}.
        </p>
      </div>

      {funds && <ReportFilterBar funds={funds} basePath="/reports/trial-balance" showDateRange={false} />}

      {!trialBalance ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <>
          {!trialBalance.balanced && (
            <div className="flex items-center gap-2 rounded-lg border border-status-bad-border bg-status-bad-bg px-4 py-3 text-sm text-status-bad">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              Total debit and total credit don&apos;t agree — this is a real accounting integrity exception, not a
              display issue. Every journal entry is balance-checked before posting, so this should never happen;
              worth investigating immediately if it does.
            </div>
          )}

          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="size-4 text-primary" aria-hidden />
                Accounts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trialBalance.accounts.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No accounts to show.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Fund</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trialBalance.accounts.map((row) => (
                        <TableRow key={row.ledgerAccountId}>
                          <TableCell className="text-sm text-muted-foreground">{row.fundName}</TableCell>
                          <TableCell className="text-sm">{row.accountName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.accountType}</TableCell>
                          <TableCell className="text-right">
                            {row.debitBalance !== "0" && <MoneyDisplay value={row.debitBalance} currency={currency} size="sm" />}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.creditBalance !== "0" && <MoneyDisplay value={row.creditBalance} currency={currency} size="sm" />}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="hover:bg-transparent font-medium">
                        <TableCell colSpan={3}>Total</TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay value={trialBalance.totalDebit} currency={currency} size="sm" />
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay value={trialBalance.totalCredit} currency={currency} size="sm" />
                        </TableCell>
                      </TableRow>
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
