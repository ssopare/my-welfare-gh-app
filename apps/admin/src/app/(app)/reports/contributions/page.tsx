import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LineChart } from "lucide-react";
import { CollectionChart, type CollectionChartRow } from "@/components/dashboard/collection-chart";
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
import type { ContributionPlan, ContributionSummaryRow, Organisation } from "@welfare/shared-types";
import { FilterBar } from "./filter-bar";

export const metadata: Metadata = {
  title: "Contribution Summary — Welfare Platform",
};

export default async function ContributionSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string }>;
}) {
  const { token } = await requireSession();
  const { planId } = await searchParams;

  const [rows, plans, organisation] = await Promise.all([
    apiFetchOrNull<ContributionSummaryRow[]>(
      `/reports/contribution-summary${planId ? `?planId=${planId}` : ""}`,
      { token, cache: "no-store" },
    ),
    apiFetchOrNull<ContributionPlan[]>("/contribution-plans", { token, cache: "no-store" }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
  ]);
  const currency = organisation?.currency ?? "GHS";

  const chartData: CollectionChartRow[] = [];
  if (rows) {
    const byPlan = new Map<string, CollectionChartRow>();
    for (const row of rows) {
      const existing = byPlan.get(row.contributionPlanId);
      if (existing) {
        existing.expected += Number.parseFloat(row.expectedTotal);
        existing.collected += Number.parseFloat(row.collectedTotal);
      } else {
        byPlan.set(row.contributionPlanId, {
          planName: row.planName,
          expected: Number.parseFloat(row.expectedTotal),
          collected: Number.parseFloat(row.collectedTotal),
        });
      }
    }
    chartData.push(...byPlan.values());
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contribution summary</h1>
          <p className="mt-1 text-sm text-muted-foreground">Expected vs. collected, grouped by plan and chapter.</p>
        </div>
        {plans && <FilterBar plans={plans} />}
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Expected vs. collected</CardTitle>
        </CardHeader>
        <CardContent>
          {!rows ? (
            <p className="py-10 text-center text-sm text-muted-foreground">You don&apos;t have access to this report.</p>
          ) : chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No contribution activity recorded yet.</p>
          ) : (
            <CollectionChart data={chartData} />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="size-4 text-primary" aria-hidden />
            By plan &amp; chapter
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!rows || rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing to show yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Plan</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Collected</TableHead>
                    <TableHead>Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.contributionPlanId}-${row.chapterId ?? "all"}`}>
                      <TableCell className="text-sm font-medium">{row.planName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.memberCount}</TableCell>
                      <TableCell>
                        <MoneyDisplay value={row.expectedTotal} currency={currency} size="sm" />
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay value={row.collectedTotal} currency={currency} size="sm" tone="good" />
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay
                          value={row.outstandingTotal}
                          currency={currency}
                          size="sm"
                          tone={Number.parseFloat(row.outstandingTotal) > 0 ? "warn" : "good"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
