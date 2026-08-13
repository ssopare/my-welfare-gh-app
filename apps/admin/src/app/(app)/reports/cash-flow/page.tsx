import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, Banknote, TrendingDown, TrendingUp } from "lucide-react";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { CashFlowStatement, Fund, Organisation } from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Cash Flow Statement — Welfare Platform",
};

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ActivitySection({
  icon,
  title,
  inflow,
  outflow,
  net,
  currency,
  footnote,
}: {
  icon: ReactNode;
  title: string;
  inflow: string;
  outflow: string;
  net: string;
  currency: string;
  footnote?: string;
}) {
  return (
    <Card className="border-border/50 shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Inflow</span>
          <MoneyDisplay value={inflow} currency={currency} size="sm" tone="good" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Outflow</span>
          <MoneyDisplay value={outflow} currency={currency} size="sm" tone="warn" />
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-medium">
          <span>Net</span>
          <MoneyDisplay
            value={net}
            currency={currency}
            size="sm"
            tone={Number.parseFloat(net) >= 0 ? "good" : "bad"}
          />
        </div>
        {footnote && <p className="mt-1 text-xs text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  );
}

export default async function CashFlowPage({
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
    apiFetchOrNull<CashFlowStatement>(
      `/reports/cash-flow?from=${effectiveFrom}&to=${effectiveTo}${fundId ? `&fundId=${fundId}` : ""}`,
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
        <h1 className="text-2xl font-semibold tracking-tight">Cash Flow Statement</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fundName ?? "All funds"} · {effectiveFrom} to {effectiveTo} · Currency: {currency}
        </p>
      </div>

      {funds && <ReportFilterBar funds={funds} basePath="/reports/cash-flow" />}

      {!statement ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <>
          {!statement.reconciles && (
            <div className="rounded-lg border border-status-bad-border bg-status-bad-bg px-4 py-3 text-sm text-status-bad">
              Net cash movement doesn&apos;t reconcile against Operating + Financing + Investing — a real
              accounting integrity exception, worth investigating.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ActivitySection
              icon={<TrendingUp className="size-4 text-status-good" aria-hidden />}
              title="Operating"
              inflow={statement.operating.inflow}
              outflow={statement.operating.outflow}
              net={statement.operating.net}
              currency={currency}
              footnote="Contributions received, benefits disbursed."
            />
            <ActivitySection
              icon={<ArrowRightLeft className="size-4 text-primary" aria-hidden />}
              title="Financing / Fund Movements"
              inflow={statement.financing.inflow}
              outflow={statement.financing.outflow}
              net={statement.financing.net}
              currency={currency}
              footnote={
                fundId
                  ? "Transfers into or out of this fund."
                  : "Transfers between this org's own funds net to zero when consolidated."
              }
            />
            <ActivitySection
              icon={<TrendingDown className="size-4 text-muted-foreground" aria-hidden />}
              title="Investing"
              inflow={statement.investing.inflow}
              outflow={statement.investing.outflow}
              net={statement.investing.net}
              currency={currency}
              footnote={statement.investing.note}
            />
          </div>

          <Card className="border-border/50 shadow-md">
            <CardContent className="flex flex-wrap items-center justify-between gap-6 py-5">
              <div className="flex items-center gap-2">
                <Banknote className="size-4 text-primary" aria-hidden />
                <span className="text-sm text-muted-foreground">Opening cash</span>
                <MoneyDisplay value={statement.openingCash} currency={currency} size="sm" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Net movement</span>
                <MoneyDisplay
                  value={statement.netCashMovement}
                  currency={currency}
                  size="sm"
                  tone={Number.parseFloat(statement.netCashMovement) >= 0 ? "good" : "bad"}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Closing cash</span>
                <MoneyDisplay value={statement.closingCash} currency={currency} size="md" />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
