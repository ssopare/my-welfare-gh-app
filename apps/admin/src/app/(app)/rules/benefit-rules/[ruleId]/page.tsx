import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, ListChecks, Repeat } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { StatusBadge } from "@/components/finance/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiFetch, apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { RULE_STATUS_META } from "@/lib/status-meta";
import type { BenefitRule, Member } from "@welfare/shared-types";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { activateBenefitRuleAction, rejectBenefitRuleAction } from "../../actions";
import { EligibilityCalculator } from "./eligibility-calculator";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ruleId: string }>;
}): Promise<Metadata> {
  const { ruleId } = await params;
  return { title: `Rule ${ruleId.slice(0, 8)} — Welfare Platform` };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function BenefitRuleDetailPage({
  params,
}: {
  params: Promise<{ ruleId: string }>;
}) {
  const { ruleId } = await params;
  const { token } = await requireSession();

  let rule: BenefitRule;
  try {
    rule = await apiFetch<BenefitRule>(`/benefit-rules/${ruleId}`, { token, cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const members = (await apiFetchOrNull<Member[]>("/members", { token, cache: "no-store" })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/rules" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to rules &amp; benefits
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{rule.name}</h1>
            <StatusBadge {...RULE_STATUS_META[rule.status]} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Triggered by {rule.triggerEvent}</p>
        </div>
        {rule.status === "DRAFT" && (
          <div className="flex gap-2">
            <AsyncActionButton label="Reject" variant="destructive" action={rejectBenefitRuleAction.bind(null, rule.id)} />
            <AsyncActionButton label="Activate" action={activateBenefitRuleAction.bind(null, rule.id)} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Calendar className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount</p>
              <MoneyDisplay value={rule.amountValue} currency={rule.currency} size="sm" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Repeat className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Occurrence cap</p>
              <p className="text-sm font-medium capitalize">
                {rule.occurrenceCapMax}× ({rule.occurrenceCapScope})
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <ListChecks className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Applies to</p>
              <p className="text-sm font-medium">{rule.subjectTypes.join(", ")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Check eligibility against a member</CardTitle>
          <p className="text-sm text-muted-foreground">
            Runs the real explainable eligibility trace — shows exactly which conditions pass or fail, not just a yes/no.
          </p>
        </CardHeader>
        <CardContent>
          {rule.status !== "ACTIVE" ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Only active rules can be checked. Activate this rule first.
            </p>
          ) : (
            <EligibilityCalculator ruleId={rule.id} members={members} />
          )}
        </CardContent>
      </Card>

      {rule.effectiveFrom && (
        <p className="text-xs text-muted-foreground">Effective from {formatDate(rule.effectiveFrom)}</p>
      )}
    </div>
  );
}
