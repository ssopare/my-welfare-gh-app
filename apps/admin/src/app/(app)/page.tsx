import type { Metadata } from "next";
import Link from "next/link";
import { HeartPulse, LayoutDashboard, PiggyBank, TrendingUp, Users } from "lucide-react";
import { AttentionTiles } from "@/components/dashboard/attention-tiles";
import { ContributionsVsClaimsChart, type ContributionsVsClaimsChartRow } from "@/components/dashboard/contributions-vs-claims-chart";
import { DashboardPeriodFilter } from "@/components/dashboard/dashboard-period-filter";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { JoinCodeWidget } from "@/components/dashboard/join-code-card";
import { FundTrendChart, type FundTrendRow } from "@/components/dashboard/fund-trend-chart";
import { FinancialMetric } from "@/components/finance/financial-metric";
import { MoneyDisplay } from "@/components/finance/money-display";
import { StatusBadge, type StatusTone } from "@/components/finance/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { DASHBOARD_PERIODS, type DashboardPeriodValue } from "@/lib/dashboard-periods";
import { requireSession } from "@/lib/session";
import type {
  Claim,
  ContributionsVsClaimsRow,
  ContributionSummaryRow,
  DefaulterRegisterRow,
  FundPositionTrendRow,
  ManagementRatiosAndHealth,
  Member,
  MemberRemovalRequest,
  Organisation,
  ReconciliationException,
} from "@welfare/shared-types";

const HEALTH_TONE: Record<ManagementRatiosAndHealth["financialHealth"], StatusTone> = {
  Healthy: "good",
  Watch: "warn",
  "At Risk": "warn",
  Critical: "bad",
};

export const metadata: Metadata = {
  title: "Dashboard — Welfare Platform",
};

function sum(values: string[]): number {
  return values.reduce((total, value) => total + Number.parseFloat(value), 0);
}

function formatPeriodLabel(from: Date, to: Date): string {
  const fmtMonth = (d: Date) => d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = to.getUTCFullYear();
  const sameMonth = from.getUTCFullYear() === year && from.getUTCMonth() === to.getUTCMonth();
  if (sameMonth) {
    return `${fmtMonth(from)} ${from.getUTCDate()}–${to.getUTCDate()}, ${year}`;
  }
  if (from.getUTCFullYear() === year) {
    return `${fmtMonth(from)} – ${fmtMonth(to)} ${year}`;
  }
  return `${fmtMonth(from)} ${from.getUTCFullYear()} – ${fmtMonth(to)} ${year}`;
}

function resolvePeriod(periodParam?: string): {
  value: DashboardPeriodValue;
  from: Date;
  to: Date;
  label: string;
} {
  const value: DashboardPeriodValue = DASHBOARD_PERIODS.some((p) => p.value === periodParam)
    ? (periodParam as DashboardPeriodValue)
    : "this_month";
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const from =
    value === "year_to_date"
      ? new Date(Date.UTC(year, 0, 1))
      : new Date(
          Date.UTC(year, month - (value === "this_month" ? 0 : value === "last_3_months" ? 2 : 5), 1),
        );
  return { value, from, to: now, label: formatPeriodLabel(from, now) };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { token } = await requireSession();
  const { period: periodParam } = await searchParams;
  const period = resolvePeriod(periodParam);

  const [
    members,
    contributionSummary,
    defaulterRegister,
    organisation,
    fundPositionTrend,
    contributionsVsClaims,
    claims,
    reconciliationExceptions,
    removalRequests,
    financialHealth,
  ] = await Promise.all([
    apiFetchOrNull<Member[]>("/members", { token, cache: "no-store" }),
    apiFetchOrNull<ContributionSummaryRow[]>(
      `/reports/contribution-summary?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
      { token, cache: "no-store" },
    ),
    apiFetchOrNull<DefaulterRegisterRow[]>("/reports/defaulter-register", {
      token,
      cache: "no-store",
    }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<FundPositionTrendRow[]>("/reports/fund-position-trend", {
      token,
      cache: "no-store",
    }),
    apiFetchOrNull<ContributionsVsClaimsRow[]>("/reports/contributions-vs-claims", {
      token,
      cache: "no-store",
    }),
    apiFetchOrNull<Claim[]>("/claims", { token, cache: "no-store" }),
    apiFetchOrNull<ReconciliationException[]>("/reconciliation-exceptions", {
      token,
      cache: "no-store",
    }),
    apiFetchOrNull<MemberRemovalRequest[]>("/members/removal-requests", {
      token,
      cache: "no-store",
    }),
    apiFetchOrNull<ManagementRatiosAndHealth>(
      `/reports/financial-health?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
      { token, cache: "no-store" },
    ),
  ]);

  const activeMembers = members?.filter((m) => m.status === "ACTIVE").length ?? null;
  const pendingMembers = members?.filter((m) => m.status === "PENDING").length ?? null;

  const expectedTotal = contributionSummary ? sum(contributionSummary.map((r) => r.expectedTotal)) : null;
  const collectedTotal = contributionSummary ? sum(contributionSummary.map((r) => r.collectedTotal)) : null;
  const outstandingTotal = contributionSummary ? sum(contributionSummary.map((r) => r.outstandingTotal)) : null;
  const collectionRate =
    expectedTotal !== null && collectedTotal !== null && expectedTotal > 0
      ? Math.round((collectedTotal / expectedTotal) * 100)
      : null;

  const membersNeedingAttention = defaulterRegister
    ? new Set(defaulterRegister.map((r) => r.memberId)).size
    : null;

  const fundTrendData: FundTrendRow[] = fundPositionTrend
    ? fundPositionTrend.map((row) => ({ month: row.month, balance: Number.parseFloat(row.balance) }))
    : [];
  const latestFundBalance = fundTrendData.length > 0 ? fundTrendData[fundTrendData.length - 1].balance : null;
  const previousFundBalance = fundTrendData.length > 1 ? fundTrendData[fundTrendData.length - 2].balance : null;
  const fundTrendDeltaPct =
    latestFundBalance !== null && previousFundBalance !== null && previousFundBalance !== 0
      ? ((latestFundBalance - previousFundBalance) / Math.abs(previousFundBalance)) * 100
      : null;

  const pendingClaimsCount = claims?.filter((c) => c.status === "SUBMITTED").length ?? 0;
  const policyExceptionsCount =
    reconciliationExceptions?.filter((e) => e.resolvedAt === null).length ?? 0;
  const pendingRemovalsCount = removalRequests?.filter((r) => r.status === "PENDING").length ?? 0;

  const contributionsVsClaimsData: ContributionsVsClaimsChartRow[] = contributionsVsClaims
    ? contributionsVsClaims.map((row) => ({
        month: row.month,
        contributions: Number.parseFloat(row.contributions),
        claimsPaid: Number.parseFloat(row.claimsPaid),
      }))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Overview dashboard"
        subtitle="Real-time overview of your welfare fund."
        icon={LayoutDashboard}
        watermarkIcon={TrendingUp}
        theme="indigo"
        rightAction={
          <div className="flex flex-wrap items-center gap-3">
            {organisation && <JoinCodeWidget joinCode={organisation.joinCode} />}
            <DashboardPeriodFilter value={period.value} rangeLabel={period.label} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <FinancialMetric
          label="Active members"
          value={
            activeMembers === null ? (
              <span className="text-lg text-muted-foreground">—</span>
            ) : (
              <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">{activeMembers}</span>
            )
          }
          support={pendingMembers ? `${pendingMembers} pending approval` : "No pending approvals"}
          icon={<Users className="size-4" />}
        />
        <FinancialMetric
          label="Collection rate"
          value={
            collectionRate === null ? (
              <span className="text-lg text-muted-foreground">—</span>
            ) : (
              <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">{collectionRate}%</span>
            )
          }
          support={
            expectedTotal !== null && collectedTotal !== null
              ? `Collected of expected, ${period.label}`
              : "Requires ledger access"
          }
          icon={<TrendingUp className="size-4" />}
        />
        <FinancialMetric
          label="Outstanding"
          value={
            outstandingTotal === null ? (
              <span className="text-lg text-muted-foreground">—</span>
            ) : (
              <MoneyDisplay value={outstandingTotal} size="xl" tone={outstandingTotal > 0 ? "warn" : "good"} />
            )
          }
          support={`Across all contribution plans, ${period.label}`}
          icon={<PiggyBank className="size-4" />}
        />
        <FinancialMetric
          label="Fund position"
          value={
            latestFundBalance === null ? (
              <span className="text-lg text-muted-foreground">—</span>
            ) : (
              <MoneyDisplay value={latestFundBalance} size="xl" />
            )
          }
          support="Total cash across all funds"
          trend={
            fundTrendDeltaPct === null
              ? undefined
              : {
                  direction: fundTrendDeltaPct >= 0 ? "up" : "down",
                  label: `${fundTrendDeltaPct >= 0 ? "+" : ""}${fundTrendDeltaPct.toFixed(1)}% vs last month`,
                }
          }
          icon={<PiggyBank className="size-4" />}
        />
        <Link href="/reports/financial-health" className="block">
          <FinancialMetric
            label="Financial health"
            value={
              financialHealth === null ? (
                <span className="text-lg text-muted-foreground">—</span>
              ) : (
                <StatusBadge
                  tone={HEALTH_TONE[financialHealth.financialHealth]}
                  label={financialHealth.financialHealth}
                  className="text-sm"
                />
              )
            }
            support={
              financialHealth
                ? `${financialHealth.collectionRate ?? "—"}% collected · ${financialHealth.arrearsRate ?? "—"}% arrears`
                : "Requires ledger access"
            }
            icon={<HeartPulse className="size-4" />}
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
          <CardHeader>
            <CardTitle className="text-base">Fund position trend</CardTitle>
          </CardHeader>
          <CardContent>
            {fundTrendData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {fundPositionTrend === null
                  ? "You don't have access to ledger reporting yet."
                  : "No ledger activity recorded yet."}
              </p>
            ) : (
              <FundTrendChart data={fundTrendData} />
            )}
          </CardContent>
        </Card>

        <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
          <CardHeader>
            <CardTitle className="text-base">Contributions vs. claims</CardTitle>
          </CardHeader>
          <CardContent>
            {contributionsVsClaimsData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {contributionsVsClaims === null
                  ? "You don't have access to ledger reporting yet."
                  : "No ledger activity recorded yet."}
              </p>
            ) : (
              <ContributionsVsClaimsChart data={contributionsVsClaimsData} />
            )}
          </CardContent>
        </Card>
      </div>

      <AttentionTiles
        pendingClaims={pendingClaimsCount}
        overdueContributions={membersNeedingAttention ?? 0}
        policyExceptions={policyExceptionsCount}
        pendingRemovals={pendingRemovalsCount}
      />
    </div>
  );
}
