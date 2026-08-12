import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Layers, Shield } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { StatusBadge } from "@/components/finance/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiFetch, apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { RULE_STATUS_META } from "@/lib/status-meta";
import type { ContributionPlan, Fund, Member } from "@welfare/shared-types";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { activatePlanAction, rejectPlanAction } from "../../actions";
import { AmendPlanDialog } from "./amend-plan-dialog";
import { DefaultFundSetting } from "./default-fund-setting";
import { GenerateObligationsForm } from "./generate-obligations-form";
import { ObligationCalculator } from "./obligation-calculator";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ planId: string }>;
}): Promise<Metadata> {
  const { planId } = await params;
  return { title: `Plan ${planId.slice(0, 8)} — Welfare Platform` };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const { token } = await requireSession();

  let plan: ContributionPlan;
  try {
    plan = await apiFetch<ContributionPlan>(`/contribution-plans/${planId}`, { token, cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const members = (await apiFetchOrNull<Member[]>("/members", { token, cache: "no-store" })) ?? [];
  const funds = (await apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/rules" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to rules &amp; benefits
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{plan.name}</h1>
            <StatusBadge {...RULE_STATUS_META[plan.status]} />
          </div>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{plan.cadence.replace("_", " ")} contribution plan</p>
        </div>
        {plan.status === "DRAFT" && (
          <div className="flex gap-2">
            <AsyncActionButton label="Reject" variant="destructive" action={rejectPlanAction.bind(null, plan.id)} />
            <AsyncActionButton label="Activate" action={activatePlanAction.bind(null, plan.id)} />
          </div>
        )}
        {plan.status === "ACTIVE" && <AmendPlanDialog plan={plan} />}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Layers className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount</p>
              <MoneyDisplay value={plan.amountValue} currency={plan.currency} size="sm" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Calendar className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Effective from</p>
              <p className="text-sm font-medium">{formatDate(plan.effectiveFrom)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Shield className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Good standing required</p>
              <p className="text-sm font-medium">{plan.goodStandingRequired ? "Yes" : "No"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Default fund</CardTitle>
          <p className="text-sm text-muted-foreground">
            Which fund a payment against this plan&apos;s dues should land in by default.
          </p>
        </CardHeader>
        <CardContent>
          {funds.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No funds exist yet — create one on the Ledger page first.
            </p>
          ) : (
            <DefaultFundSetting planId={plan.id} fundId={plan.defaultFundId} funds={funds} />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Try it against a member</CardTitle>
          <p className="text-sm text-muted-foreground">
            Calls the real obligation calculator for this plan — nothing is charged, this is a preview.
          </p>
        </CardHeader>
        <CardContent>
          {plan.status !== "ACTIVE" ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Only active plans can be previewed. Activate this plan first.
            </p>
          ) : (
            <ObligationCalculator planId={plan.id} members={members} />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Generate obligations</CardTitle>
          <p className="text-sm text-muted-foreground">
            Puts members on the hook for a due date under this plan — nothing is billed until a
            payment is actually recorded against it.
          </p>
        </CardHeader>
        <CardContent>
          {plan.status !== "ACTIVE" ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Only active plans can generate obligations. Activate this plan first.
            </p>
          ) : (
            <GenerateObligationsForm planId={plan.id} members={members} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
