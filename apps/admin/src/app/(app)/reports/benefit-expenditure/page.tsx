import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, HeartPulse } from "lucide-react";
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
import type { BenefitExpenditureAnalytics, Organisation } from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Benefit Expenditure Analytics — Welfare Platform",
};

export default async function BenefitExpenditurePage() {
  const { token } = await requireSession();

  const [organisation, analytics] = await Promise.all([
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<BenefitExpenditureAnalytics>("/reports/benefit-expenditure", { token, cache: "no-store" }),
  ]);
  const currency = organisation?.currency ?? "GHS";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Benefit Expenditure Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every claim at every stage, grouped by benefit type — not just the paid ones.
        </p>
      </div>

      {!analytics ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="border-border/50 shadow-md">
              <CardContent className="py-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total benefits paid</p>
                <MoneyDisplay value={analytics.totalBenefitsPaid} currency={currency} size="lg" className="mt-2" tone="warn" />
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-md">
              <CardContent className="py-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total contribution income</p>
                <MoneyDisplay value={analytics.totalContributionIncome} currency={currency} size="lg" className="mt-2" tone="good" />
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-md">
              <CardContent className="py-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Benefits as % of income</p>
                <p className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
                  {analytics.benefitsAsPercentOfIncome ?? "—"}
                  {analytics.benefitsAsPercentOfIncome && "%"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulse className="size-4 text-primary" aria-hidden />
                By benefit type
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.byBenefitType.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No claims have been submitted yet.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Benefit type</TableHead>
                        <TableHead className="text-right">Total paid</TableHead>
                        <TableHead className="text-right">Beneficiaries</TableHead>
                        <TableHead className="text-right">Average benefit</TableHead>
                        <TableHead className="text-right">Submitted</TableHead>
                        <TableHead className="text-right">Approved (unpaid)</TableHead>
                        <TableHead className="text-right">Rejected</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.byBenefitType.map((row) => (
                        <TableRow key={row.benefitRuleId}>
                          <TableCell className="text-sm font-medium">{row.benefitName}</TableCell>
                          <TableCell className="text-right">
                            <MoneyDisplay value={row.totalPaid} currency={currency} size="sm" />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">{row.beneficiaryCount}</TableCell>
                          <TableCell className="text-right">
                            <MoneyDisplay value={row.averageBenefit} currency={currency} size="sm" />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                            {row.statusCounts.submitted}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-status-warn">
                            {row.statusCounts.approved}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-status-bad">
                            {row.statusCounts.rejected}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-status-good">
                            {row.statusCounts.paid}
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
