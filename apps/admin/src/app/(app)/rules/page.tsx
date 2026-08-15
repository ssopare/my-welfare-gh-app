import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Scale } from "lucide-react";
import { StatusBadge } from "@/components/finance/status-badge";
import { MoneyDisplay } from "@/components/finance/money-display";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { RULE_STATUS_META } from "@/lib/status-meta";
import type { BenefitRule, ContributionPlan, Fund } from "@welfare/shared-types";
import { activateBenefitRuleAction, activatePlanAction, rejectBenefitRuleAction, rejectPlanAction } from "./actions";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { NewPlanDialog } from "./new-plan-dialog";
import { NewRuleDialog } from "./new-rule-dialog";

export const metadata: Metadata = {
  title: "Rules & Benefits — Welfare Platform",
};

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

export default async function RulesPage() {
  const { token } = await requireSession();

  const [plans, rules, funds] = await Promise.all([
    apiFetchOrNull<ContributionPlan[]>("/contribution-plans/all", { token, cache: "no-store" }),
    apiFetchOrNull<BenefitRule[]>("/benefit-rules/all", { token, cache: "no-store" }),
    apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Rules & Benefits"
        subtitle="Contribution plans and benefit rules — every change creates a new, timestamped version."
        icon={Scale}
        theme="indigo"
      />

      {!plans && !rules ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Scale className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">You don&apos;t have access to rule management.</p>
        </div>
      ) : (
        <Tabs defaultValue="plans">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="plans">Contribution plans</TabsTrigger>
              <TabsTrigger value="benefits">Benefit rules</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="plans" className="mt-4 flex flex-col gap-3">
            <div className="flex justify-end">
              <NewPlanDialog funds={funds ?? []} />
            </div>
            <div className="overflow-hidden rounded-xl border border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Cadence</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!plans || plans.length === 0 ? (
                    <EmptyRow colSpan={5} label="No contribution plans yet." />
                  ) : (
                    plans.map((plan) => (
                      <TableRow key={plan.id} className="group transition-colors duration-150 hover:bg-primary/5">
                        <TableCell>
                          <Link href={`/rules/plans/${plan.id}`} className="flex items-center gap-1.5 font-medium hover:underline">
                            {plan.name}
                            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm capitalize text-muted-foreground">
                          {plan.cadence.replace("_", " ")}
                        </TableCell>
                        <TableCell>
                          <MoneyDisplay value={plan.amountValue} currency={plan.currency} size="sm" />
                        </TableCell>
                        <TableCell>
                          <StatusBadge {...RULE_STATUS_META[plan.status]} />
                        </TableCell>
                        <TableCell>
                          {plan.status === "DRAFT" && (
                            <div className="flex justify-end gap-2">
                              <AsyncActionButton label="Reject" variant="destructive" action={rejectPlanAction.bind(null, plan.id)} />
                              <AsyncActionButton label="Activate" action={activatePlanAction.bind(null, plan.id)} />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="benefits" className="mt-4 flex flex-col gap-3">
            <div className="flex justify-end">
              <NewRuleDialog />
            </div>
            <div className="overflow-hidden rounded-xl border border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!rules || rules.length === 0 ? (
                    <EmptyRow colSpan={5} label="No benefit rules yet." />
                  ) : (
                    rules.map((rule) => (
                      <TableRow key={rule.id} className="group transition-colors duration-150 hover:bg-primary/5">
                        <TableCell>
                          <Link
                            href={`/rules/benefit-rules/${rule.id}`}
                            className="flex items-center gap-1.5 font-medium hover:underline"
                          >
                            {rule.name}
                            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{rule.triggerEvent}</TableCell>
                        <TableCell>
                          <MoneyDisplay value={rule.amountValue} currency={rule.currency} size="sm" />
                        </TableCell>
                        <TableCell>
                          <StatusBadge {...RULE_STATUS_META[rule.status]} />
                        </TableCell>
                        <TableCell>
                          {rule.status === "DRAFT" && (
                            <div className="flex justify-end gap-2">
                              <AsyncActionButton
                                label="Reject"
                                variant="destructive"
                                action={rejectBenefitRuleAction.bind(null, rule.id)}
                              />
                              <AsyncActionButton label="Activate" action={activateBenefitRuleAction.bind(null, rule.id)} />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
