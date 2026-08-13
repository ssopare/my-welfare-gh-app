import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Fund, IncomeExpenditureStatement, Organisation } from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Income & Expenditure Statement — Welfare Platform",
};

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function IncomeExpenditurePage({
  searchParams,
}: {
  searchParams: Promise<{ fundId?: string; from?: string; to?: string }>;
}) {
  const { token } = await requireSession();
  const { fundId, from, to } = await searchParams;
  const effectiveFrom = from || monthStart();
  const effectiveTo = to || today();

  const [funds, organisation, statement] = await Promise.all([
    apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<IncomeExpenditureStatement>(
      `/reports/income-expenditure?from=${effectiveFrom}&to=${effectiveTo}${fundId ? `&fundId=${fundId}` : ""}`,
      { token, cache: "no-store" },
    ),
  ]);
  const currency = organisation?.currency ?? "GHS";
  const fundName = fundId ? funds?.find((f) => f.id === fundId)?.name : "All funds";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Income &amp; Expenditure Statement</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fundName ?? "All funds"} · {effectiveFrom} to {effectiveTo} · Currency: {currency}
        </p>
      </div>

      {funds && <ReportFilterBar funds={funds} basePath="/reports/income-expenditure" />}

      {!statement ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4 text-status-good" aria-hidden />
                Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statement.incomeLines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No income posted in this period.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {statement.incomeLines.map((line) => (
                    <li key={line.ledgerAccountId} className="flex items-center justify-between py-2 first:pt-0">
                      <span className="text-sm text-muted-foreground">{line.accountName}</span>
                      <MoneyDisplay value={line.amount} currency={currency} size="sm" />
                    </li>
                  ))}
                  <li className="flex items-center justify-between pt-3 font-medium">
                    <span>Total income</span>
                    <MoneyDisplay value={statement.totalIncome} currency={currency} tone="good" />
                  </li>
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="size-4 text-status-bad" aria-hidden />
                Expenditure
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statement.expenseLines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No expenditure posted in this period.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {statement.expenseLines.map((line) => (
                    <li key={line.ledgerAccountId} className="flex items-center justify-between py-2 first:pt-0">
                      <span className="text-sm text-muted-foreground">{line.accountName}</span>
                      <MoneyDisplay value={line.amount} currency={currency} size="sm" />
                    </li>
                  ))}
                  <li className="flex items-center justify-between pt-3 font-medium">
                    <span>Total expenditure</span>
                    <MoneyDisplay value={statement.totalExpense} currency={currency} tone="warn" />
                  </li>
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-md lg:col-span-2">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Surplus / (Deficit) for the period</p>
                <MoneyDisplay
                  value={statement.surplusOrDeficit}
                  currency={currency}
                  size="xl"
                  tone={Number.parseFloat(statement.surplusOrDeficit) >= 0 ? "good" : "bad"}
                />
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Opening accumulated fund</p>
                  <MoneyDisplay value={statement.openingAccumulatedFund} currency={currency} size="sm" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Closing accumulated fund</p>
                  <MoneyDisplay value={statement.closingAccumulatedFund} currency={currency} size="sm" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
