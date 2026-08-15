import type { Metadata } from "next";
import { CalendarClock, CreditCard } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { StatusBadge } from "@/components/finance/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { SUBSCRIPTION_STATUS_META } from "@/lib/status-meta";
import type { Subscription, SubscriptionPlan } from "@welfare/shared-types";
import { SubscribeDialog } from "./subscribe-dialog";

export const metadata: Metadata = {
  title: "Billing — Welfare Platform",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

const CADENCE_LABEL: Record<string, string> = {
  monthly: "month",
  annual: "year",
  termly: "term",
};

export default async function BillingPage() {
  const { token } = await requireSession();

  const [subscription, plans] = await Promise.all([
    apiFetchOrNull<Subscription>("/subscription", { token, cache: "no-store" }),
    apiFetchOrNull<SubscriptionPlan[]>("/subscription-plans", { token, cache: "no-store" }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Billing"
        subtitle="Your organisation's own subscription — separate from the welfare fund ledger."
        icon={CreditCard}
        theme="indigo"
      />

      {!subscription ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <CreditCard className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">You don&apos;t have access to billing.</p>
        </div>
      ) : (
        <>
          <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>Current subscription</span>
                <StatusBadge {...SUBSCRIPTION_STATUS_META[subscription.status]} />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan</p>
                <p className="text-sm font-medium">{subscription.plan?.name ?? "No plan selected yet"}</p>
              </div>
              {subscription.plan && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Price</p>
                  <MoneyDisplay value={subscription.plan.priceAmount} currency={subscription.plan.currency} size="sm" />
                  <span className="ml-1 text-xs text-muted-foreground">
                    / {CADENCE_LABEL[subscription.plan.billingCadence] ?? subscription.plan.billingCadence}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {subscription.status === "TRIAL" ? "Trial ends" : "Current period ends"}
                  </p>
                  <p className="text-sm font-medium">
                    {subscription.status === "TRIAL"
                      ? formatDate(subscription.trialEndsAt)
                      : subscription.currentPeriodEnd
                        ? formatDate(subscription.currentPeriodEnd)
                        : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <h2 className="text-lg font-semibold tracking-tight">Available plans</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {subscription.status === "TRIAL"
                ? "Choose a plan any time before your trial ends — no interruption to your data."
                : "Switch plans any time; billing restarts from today under the new plan."}
            </p>
          </div>

          {!plans || plans.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No subscription plans are available yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card key={plan.id} className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
                  <CardHeader>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div>
                      <MoneyDisplay value={plan.priceAmount} currency={plan.currency} size="lg" />
                      <span className="ml-1 text-sm text-muted-foreground">
                        / {CADENCE_LABEL[plan.billingCadence] ?? plan.billingCadence}
                      </span>
                    </div>
                    <SubscribeDialog plan={plan} isCurrent={subscription.planId === plan.id} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
