import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Info, Landmark, Wallet } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { FundPositionReport, Organisation } from "@welfare/shared-types";
import { DateRangeFilter } from "./date-range-filter";

export const metadata: Metadata = {
  title: "Fund Position Report — Welfare Platform",
};

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function FundPositionPage({
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
    apiFetchOrNull<FundPositionReport>(
      `/reports/fund-position?from=${effectiveFrom}&to=${effectiveTo}`,
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
        <h1 className="text-2xl font-semibold tracking-tight">Fund Position Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {effectiveFrom} to {effectiveTo} · Currency: {currency} · Fund Balance is not the same as Bank
          Balance — see Cash Available on each card.
        </p>
      </div>

      <DateRangeFilter basePath="/reports/fund-position" />

      {!report ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {report.funds.map((fund) => (
              <Card key={fund.fundId} className="border-border/50 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Landmark className="size-4 text-primary" aria-hidden />
                    {fund.fundName}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col divide-y divide-border">
                    <li className="flex items-center justify-between py-2 first:pt-0">
                      <span className="text-sm text-muted-foreground">Opening fund balance</span>
                      <MoneyDisplay value={fund.openingFundBalance} currency={currency} size="sm" />
                    </li>
                    <li className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">Income</span>
                      <MoneyDisplay value={fund.income} currency={currency} size="sm" tone="good" />
                    </li>
                    <li className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">Expenses</span>
                      <MoneyDisplay value={fund.expenses} currency={currency} size="sm" tone="warn" />
                    </li>
                    <li className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">Transfers in / out</span>
                      <span className="flex items-center gap-2">
                        <MoneyDisplay value={fund.transfersIn} currency={currency} size="sm" tone="good" />
                        <span className="text-xs text-muted-foreground">/</span>
                        <MoneyDisplay value={fund.transfersOut} currency={currency} size="sm" tone="warn" />
                      </span>
                    </li>
                    <li className="flex items-center justify-between py-2 font-medium">
                      <span className="text-sm">Surplus / (Deficit)</span>
                      <MoneyDisplay
                        value={fund.surplusOrDeficit}
                        currency={currency}
                        size="sm"
                        tone={Number.parseFloat(fund.surplusOrDeficit) >= 0 ? "good" : "bad"}
                      />
                    </li>
                    <li className="flex items-center justify-between py-2 font-medium">
                      <span className="text-sm">Closing fund balance</span>
                      <MoneyDisplay value={fund.closingFundBalance} currency={currency} size="sm" />
                    </li>
                    <li className="flex items-center justify-between py-2">
                      <span className="text-sm text-muted-foreground">Cash available</span>
                      <MoneyDisplay value={fund.cashAvailable} currency={currency} size="sm" />
                    </li>
                    <li className="flex items-center justify-between py-2 last:pb-0">
                      <span className="text-sm text-muted-foreground">Payables</span>
                      <MoneyDisplay value={fund.payables} currency={currency} size="sm" />
                    </li>
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="size-4 text-primary" aria-hidden />
                Committed &amp; Uncommitted (organisation-wide)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Total cash available
                  </p>
                  <MoneyDisplay
                    value={report.organisationSummary.totalCashAvailable}
                    currency={currency}
                    size="lg"
                    className="mt-1"
                  />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Committed benefits
                  </p>
                  <MoneyDisplay
                    value={report.organisationSummary.totalCommittedBenefits}
                    currency={currency}
                    size="lg"
                    className="mt-1"
                    tone="warn"
                  />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Available uncommitted funds
                  </p>
                  <MoneyDisplay
                    value={report.organisationSummary.availableUncommittedFunds}
                    currency={currency}
                    size="lg"
                    className="mt-1"
                    tone={Number.parseFloat(report.organisationSummary.availableUncommittedFunds) >= 0 ? "good" : "bad"}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{report.organisationSummary.note}</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
