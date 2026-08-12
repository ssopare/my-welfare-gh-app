"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type {
  AppointOfficerInput,
  CreateGovernanceBodyInput,
  GovernanceBody,
  GovernanceOfficer,
} from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

function parsedOrUndefined(value: FormDataEntryValue | null): number | undefined {
  const str = String(value ?? "").trim();
  if (!str) return undefined;
  const n = Number.parseInt(str, 10);
  return Number.isNaN(n) ? undefined : n;
}

export async function createGovernanceBodyAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const input: CreateGovernanceBodyInput = {
    name: String(formData.get("name") ?? "").trim(),
    membershipCompositionRule: String(formData.get("membershipCompositionRule") ?? "").trim() || undefined,
    quorumRule: String(formData.get("quorumRule") ?? "").trim() || undefined,
    meetingCadence: String(formData.get("meetingCadence") ?? "").trim() || undefined,
    maxConsecutiveTerms: parsedOrUndefined(formData.get("maxConsecutiveTerms")),
    coolingOffPeriodMonths: parsedOrUndefined(formData.get("coolingOffPeriodMonths")),
  };

  if (!input.name) {
    return { error: "A name is required." };
  }

  try {
    await apiFetch<GovernanceBody>("/governance-bodies", { method: "POST", token, body: input });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/governance");
  return { error: null, success: true };
}

export async function appointOfficerAction(
  bodyId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const input: AppointOfficerInput = {
    memberId: String(formData.get("memberId") ?? ""),
    roleId: String(formData.get("roleId") ?? ""),
    termEnd: String(formData.get("termEnd") ?? "").trim() || undefined,
  };

  if (!input.memberId || !input.roleId) {
    return { error: "Choose a member and a role." };
  }

  try {
    await apiFetch<GovernanceOfficer>(`/governance-bodies/${bodyId}/officers`, {
      method: "POST",
      token,
      body: input,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath(`/governance/${bodyId}`);
  return { error: null, success: true };
}

export async function revokeOfficerAction(assignmentId: string, bodyId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/role-assignments/${assignmentId}/revoke`, { method: "PATCH", token, body: {} });
  revalidatePath(`/governance/${bodyId}`);
}
