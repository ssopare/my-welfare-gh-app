import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Target } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { StatusBadge, type StatusTone } from "@/components/finance/status-badge";
import { AsyncActionButton } from "@/components/ui/async-action-button";
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
import type { BudgetWithActual, Fund, Organisation } from "@welfare/shared-types";
import { deleteBudgetAction } from "./actions";
import { NewBudgetDialog } from "./new-budget-dialog";

export const metadata: Metadata = {
  title: "Budget vs. Actual — Welfare Platform",
};

const STATUS_LABEL: Record<BudgetWithActual["status"], string> = {
  over_budget: "Over budget",
  on_track: "On track",
  underperforming: "Underperforming",
};

const STATUS_TONE: Record<BudgetWithActual["status"], StatusTone> = {
  over_budget: "bad",
  on_track: "good",
  underperforming: "warn",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function BudgetVsActualPage() {
  const { token } = await requireSession();

  const [funds, organisation, budgets] = await Promise.all([
    apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<BudgetWithActual[]>("/budgets", { token, cache: "no-store" }),
  ]);
  const currency = organisation?.currency ?? "GHS";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budget vs. Actual</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Actual is always a live query over the ledger, for each budget&apos;s own period — never entered by
            hand.
          </p>
        </div>
        {funds && <NewBudgetDialog funds={funds} />}
      </div>

      {!budgets ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-primary" aria-hidden />
              Budgets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {budgets.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No budgets yet — set a target for an Income or Expense account to track it against real activity.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Account</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Budgeted</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {budgets.map((budget) => (
                      <TableRow key={budget.id}>
                        <TableCell className="text-sm">{budget.accountName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(budget.periodStart)} – {formatDate(budget.periodEnd)}
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay value={budget.budgeted} currency={currency} size="sm" />
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay value={budget.actual} currency={currency} size="sm" />
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay
                            value={budget.variance}
                            currency={currency}
                            size="sm"
                            tone={Number.parseFloat(budget.variance) <= 0 ? "good" : "warn"}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={STATUS_TONE[budget.status]} label={STATUS_LABEL[budget.status]} />
                        </TableCell>
                        <TableCell>
                          <AsyncActionButton
                            label="Delete"
                            variant="destructive"
                            action={deleteBudgetAction.bind(null, budget.id)}
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
      )}
    </div>
  );
}
