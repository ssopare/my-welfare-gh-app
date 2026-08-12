"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { DefaulterPolicy, SetDefaulterPolicyInput } from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

export async function setPolicyAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const input: SetDefaulterPolicyInput = {
    defaulterThresholdMonths: Number.parseInt(String(formData.get("defaulterThresholdMonths") ?? "0"), 10),
    forfeitureThresholdMonths: Number.parseInt(String(formData.get("forfeitureThresholdMonths") ?? "0"), 10),
  };

  if (!input.defaulterThresholdMonths || !input.forfeitureThresholdMonths) {
    return { error: "Both thresholds are required." };
  }

  try {
    await apiFetch<DefaulterPolicy>("/defaulter-policy", { method: "POST", token, body: input });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/defaulters");
  return { error: null, success: true };
}

export async function reassessAction(memberId: string, contributionPlanId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/members/${memberId}/contribution-plans/${contributionPlanId}/reassess-standing`, {
    method: "POST",
    token,
    body: {},
  });
  revalidatePath("/defaulters");
}
