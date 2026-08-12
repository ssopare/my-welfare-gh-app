"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type {
  Claim,
  DecideClaimInput,
  EligibilityCheck,
  SubmitClaimInput,
} from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

export interface SubmitClaimState extends FormActionState {
  checks?: EligibilityCheck[];
}

function ineligibilityChecks(error: ApiError): EligibilityCheck[] | undefined {
  if (
    error.body &&
    typeof error.body === "object" &&
    "checks" in error.body &&
    Array.isArray((error.body as { checks: unknown }).checks)
  ) {
    return (error.body as { checks: EligibilityCheck[] }).checks;
  }
  return undefined;
}

export async function submitClaimAction(
  ruleId: string,
  _prevState: SubmitClaimState,
  formData: FormData,
): Promise<SubmitClaimState> {
  const { token } = await requireSession();
  const evidenceJson = String(formData.get("evidenceJson") ?? "[]");
  let evidence: { evidenceType: string; description: string }[];
  try {
    evidence = JSON.parse(evidenceJson);
  } catch {
    evidence = [];
  }

  const input: SubmitClaimInput = {
    memberId: String(formData.get("memberId") ?? ""),
    dependantId: String(formData.get("dependantId") ?? "").trim() || undefined,
    eventDate: String(formData.get("eventDate") ?? ""),
    evidence: evidence.length ? evidence : undefined,
  };

  if (!input.memberId || !input.eventDate) {
    return { error: "Choose a member and an event date." };
  }

  try {
    await apiFetch<Claim>(`/benefit-rules/${ruleId}/claims`, {
      method: "POST",
      token,
      body: input,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, checks: ineligibilityChecks(error) };
    }
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/claims");
  return { error: null, success: true };
}

export async function decideClaimAction(
  claimId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const input: DecideClaimInput = {
    decision: String(formData.get("decision") ?? "APPROVE") as "APPROVE" | "REJECT",
    comment: String(formData.get("comment") ?? "").trim() || undefined,
  };

  try {
    await apiFetch(`/claims/${claimId}/decide`, { method: "POST", token, body: input });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/claims");
  revalidatePath(`/claims/${claimId}`);
  return { error: null, success: true };
}

export async function disburseClaimAction(
  claimId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const fundId = String(formData.get("fundId") ?? "");
  if (!fundId) {
    return { error: "Choose a fund." };
  }

  try {
    await apiFetch(`/claims/${claimId}/disburse`, { method: "POST", token, body: { fundId } });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/claims");
  revalidatePath(`/claims/${claimId}`);
  return { error: null, success: true };
}
