"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type {
  BenefitRule,
  ContributionPlan,
  CreateBenefitRuleInput,
  CreateContributionPlanInput,
  EligibilityResult,
  ObligationComputation,
} from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

export interface ObligationPreviewState {
  error: string | null;
  result?: ObligationComputation;
}

export interface EligibilityPreviewState {
  error: string | null;
  result?: EligibilityResult;
}

export interface GenerateObligationsState {
  error: string | null;
  successCount?: number;
  failures?: { memberId: string; message: string }[];
}

export interface PlanAmendmentState {
  error: string | null;
  newPlanId?: string;
}

function parsedOrUndefined(value: FormDataEntryValue | null): number | undefined {
  const str = String(value ?? "").trim();
  if (!str) return undefined;
  const n = Number.parseInt(str, 10);
  return Number.isNaN(n) ? undefined : n;
}

export async function createContributionPlanAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const computationType = String(formData.get("computationType") ?? "fixed").trim();
  const rawAmount = String(formData.get("amountValue") ?? "").trim();
  const amountValue = computationType === "voluntary" ? "0.00" : rawAmount;

  const input: CreateContributionPlanInput = {
    name: String(formData.get("name") ?? "").trim(),
    cadence: String(formData.get("cadence") ?? "monthly"),
    amountValue,
    currency: String(formData.get("currency") ?? "GHS").trim(),
    computationType,
    minTenureMonths: parsedOrUndefined(formData.get("minTenureMonths")),
    goodStandingRequired: formData.get("goodStandingRequired") === "on",
    paymentGracePeriodDays: parsedOrUndefined(formData.get("paymentGracePeriodDays")),
    defaultFundId: String(formData.get("defaultFundId") ?? "").trim() || undefined,
  };

  if (!input.name || (computationType !== "voluntary" && !input.amountValue)) {
    return { error: "Name and amount are required." };
  }

  try {
    await apiFetch<ContributionPlan>("/contribution-plans", {
      method: "POST",
      token,
      body: input,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/rules");
  return { error: null, success: true };
}

export async function createBenefitRuleAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const subjectTypes = String(formData.get("subjectTypes") ?? "self")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const input: CreateBenefitRuleInput = {
    name: String(formData.get("name") ?? "").trim(),
    triggerEvent: String(formData.get("triggerEvent") ?? "").trim(),
    subjectTypes,
    amountValue: String(formData.get("amountValue") ?? "").trim(),
    currency: String(formData.get("currency") ?? "GHS").trim(),
    occurrenceCapMax: parsedOrUndefined(formData.get("occurrenceCapMax")) ?? 1,
    minTenureMonths: parsedOrUndefined(formData.get("minTenureMonths")),
    goodStandingRequired: formData.get("goodStandingRequired") === "on",
  };

  if (!input.name || !input.triggerEvent || !input.amountValue) {
    return { error: "Name, trigger event, and amount are required." };
  }

  try {
    await apiFetch<BenefitRule>("/benefit-rules", {
      method: "POST",
      token,
      body: input,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/rules");
  return { error: null, success: true };
}

// Edits the existing plan row in place — see the backend's own comment on
// ContributionPlanService.setDefaultFund for why this doesn't go through
// full draft/activate versioning the way amount/cadence changes do.
export async function setPlanDefaultFundAction(planId: string, fundId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/contribution-plans/${planId}/default-fund`, {
    method: "PATCH",
    token,
    body: { fundId },
  });
  revalidatePath("/rules");
  revalidatePath(`/rules/plans/${planId}`);
}

// Corrects/changes a plan's amount by amending it — never edits the
// existing row (amount is a real rule characteristic, not operational
// metadata like defaultFundId). Everything else carries over unchanged
// from the current plan; the two fields that actually vary for a
// correction (new amount, effective date) are what the dialog asks for.
// Creates the successor as a draft with supersedesId, then immediately
// activates it with the chosen effectiveFrom — from the admin's
// perspective this is one action ("change the rate, effective this
// date"), even though it's two API calls under the hood, the same way
// generateObligationsAction orchestrates several calls behind one submit.
export async function createPlanAmendmentAction(
  planId: string,
  _prevState: PlanAmendmentState,
  formData: FormData,
): Promise<PlanAmendmentState> {
  const { token } = await requireSession();
  const amountValue = String(formData.get("amountValue") ?? "").trim();
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();

  if (!amountValue || !effectiveFrom) {
    return { error: "Amount and effective date are required." };
  }

  try {
    const current = await apiFetch<ContributionPlan>(`/contribution-plans/${planId}`, {
      token,
      cache: "no-store",
    });

    const input: CreateContributionPlanInput = {
      name: current.name,
      cadence: current.cadence,
      amountValue,
      currency: current.currency,
      collectionMechanism: current.collectionMechanism,
      defaultFundId: current.defaultFundId ?? undefined,
      chapterId: current.chapterId ?? undefined,
      minTenureMonths: current.minTenureMonths ?? undefined,
      goodStandingRequired: current.goodStandingRequired,
      joiningGracePeriodDays: current.joiningGracePeriodDays ?? undefined,
      paymentGracePeriodDays: current.paymentGracePeriodDays ?? undefined,
      reinstatementWaitingPeriodMonths: current.reinstatementWaitingPeriodMonths ?? undefined,
      reminderDaysBeforeDue: current.reminderDaysBeforeDue ?? undefined,
      supersedesId: planId,
    };

    const successor = await apiFetch<ContributionPlan>("/contribution-plans", {
      method: "POST",
      token,
      body: input,
    });
    await apiFetch(`/contribution-plans/${successor.id}/activate`, {
      method: "POST",
      token,
      body: { effectiveFrom },
    });

    revalidatePath("/rules");
    revalidatePath(`/rules/plans/${planId}`);
    revalidatePath(`/rules/plans/${successor.id}`);
    return { error: null, newPlanId: successor.id };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }
}

export async function activatePlanAction(planId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/contribution-plans/${planId}/activate`, { method: "POST", token, body: {} });
  revalidatePath("/rules");
  revalidatePath(`/rules/plans/${planId}`);
}

export async function rejectPlanAction(planId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/contribution-plans/${planId}/reject`, { method: "POST", token, body: {} });
  revalidatePath("/rules");
  revalidatePath(`/rules/plans/${planId}`);
}

export async function activateBenefitRuleAction(ruleId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/benefit-rules/${ruleId}/activate`, { method: "POST", token, body: {} });
  revalidatePath("/rules");
  revalidatePath(`/rules/benefit-rules/${ruleId}`);
}

export async function rejectBenefitRuleAction(ruleId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/benefit-rules/${ruleId}/reject`, { method: "POST", token, body: {} });
  revalidatePath("/rules");
  revalidatePath(`/rules/benefit-rules/${ruleId}`);
}

// Live preview panels — call the real compute-obligation/evaluate-eligibility
// endpoints against a sample member while an admin is looking at a plan or
// rule, so they see the actual effect before it ever matters for real. No
// new backend capability needed: both endpoints have existed since the
// rule-engine slice.
export async function computeObligationPreviewAction(
  planId: string,
  _prevState: ObligationPreviewState,
  formData: FormData,
): Promise<ObligationPreviewState> {
  const { token } = await requireSession();
  const memberId = String(formData.get("memberId") ?? "");
  const periodDate = String(formData.get("periodDate") ?? "");

  if (!memberId || !periodDate) {
    return { error: "Pick a member and a period date." };
  }

  try {
    const result = await apiFetch<ObligationComputation>(
      `/contribution-plans/${planId}/compute-obligation`,
      { method: "POST", token, body: { memberId, periodDate } },
    );
    return { error: null, result };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }
}

// The gap this closes: POST /contribution-plans/:id/obligations has
// always existed and works (every e2e test and the demo seed script use
// it), but nothing in the console ever called it — obligations could only
// ever be created by hitting the API directly. Loops one call per
// selected member rather than a new bulk backend endpoint: each creation
// is already independent and fully validated on its own, and a partial
// failure (e.g. one member's plan-eligibility check fails) shouldn't
// block the rest or need new atomicity semantics invented for it.
export async function generateObligationsAction(
  planId: string,
  _prevState: GenerateObligationsState,
  formData: FormData,
): Promise<GenerateObligationsState> {
  const { token } = await requireSession();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);

  if (!dueDate) {
    return { error: "A due date is required." };
  }
  if (memberIds.length === 0) {
    return { error: "Select at least one member." };
  }

  const failures: { memberId: string; message: string }[] = [];
  let successCount = 0;
  for (const memberId of memberIds) {
    try {
      await apiFetch(`/contribution-plans/${planId}/obligations`, {
        method: "POST",
        token,
        body: { memberId, dueDate },
      });
      successCount += 1;
    } catch (error) {
      failures.push({
        memberId,
        message: error instanceof ApiError ? error.message : "Something went wrong.",
      });
    }
  }

  revalidatePath(`/rules/plans/${planId}`);
  revalidatePath("/reports/contributions");
  return { error: null, successCount, failures };
}

export async function evaluateEligibilityPreviewAction(
  ruleId: string,
  _prevState: EligibilityPreviewState,
  formData: FormData,
): Promise<EligibilityPreviewState> {
  const { token } = await requireSession();
  const memberId = String(formData.get("memberId") ?? "");
  const eventDate = String(formData.get("eventDate") ?? "");
  const dependantId = String(formData.get("dependantId") ?? "").trim() || undefined;

  if (!memberId || !eventDate) {
    return { error: "Pick a member and an event date." };
  }

  try {
    const result = await apiFetch<EligibilityResult>(
      `/benefit-rules/${ruleId}/evaluate-eligibility`,
      { method: "POST", token, body: { memberId, eventDate, dependantId } },
    );
    return { error: null, result };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }
}
