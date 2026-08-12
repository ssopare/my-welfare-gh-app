import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetchOrNull } from "@/lib/api-client";
import { requirePlatformSession } from "@/lib/platform-session";
import type { SubscriptionPlan } from "@welfare/shared-types";
import { archivePlanAction } from "../actions";
import { NewPlanDialog } from "./new-plan-dialog";

export const metadata: Metadata = {
  title: "Subscription Plans — Platform Operator",
};

const CADENCE_LABEL: Record<string, string> = {
  monthly: "month",
  annual: "year",
  termly: "term",
};

export default async function PlatformPlansPage() {
  const { token } = await requirePlatformSession();
  const plans = await apiFetchOrNull<SubscriptionPlan[]>("/subscription-plans?includeArchived=true", {
    token,
    cache: "no-store",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscription plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">The pricing table every tenant chooses from — never hardcoded.</p>
        </div>
        <NewPlanDialog />
      </div>

      {!plans ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <CreditCard className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No plans found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 shadow-md">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>
                    <MoneyDisplay value={plan.priceAmount} currency={plan.currency} size="sm" />
                    <span className="ml-1 text-xs text-muted-foreground">
                      / {CADENCE_LABEL[plan.billingCadence] ?? plan.billingCadence}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{plan.trialDays} days</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={plan.archived ? "" : "border-status-good-border bg-status-good-bg text-status-good"}>
                      {plan.archived ? "Archived" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!plan.archived && (
                      <AsyncActionButton label="Archive" variant="destructive" action={archivePlanAction.bind(null, plan.id)} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
