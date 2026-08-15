"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type {
  AppointOfficerInput,
  CreateGovernanceBodyInput,
  GovernanceBody,
  GovernanceOfficer,
  ElectionStatus,
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

export async function createElectionAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  
  const type = String(formData.get("type") ?? "OFFICER") as "OFFICER" | "ISSUE";
  const isAnonymous = formData.get("isAnonymous") === "true";
  const requireGoodStanding = formData.get("requireGoodStandingForNominee") === "true";
  const requireNoArrears = formData.get("requireNoArrearsForNominee") === "true";

  const rawOptions = String(formData.get("options") ?? "").trim();
  const options = rawOptions ? rawOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined;

  const rawNomineeMemberIds = String(formData.get("nomineeMemberIds") ?? "").trim();
  const nomineeMemberIds = rawNomineeMemberIds ? rawNomineeMemberIds.split(",").map((id) => id.trim()).filter(Boolean) : undefined;

  const input = {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    type,
    isAnonymous,
    quorumPercentage: Number(formData.get("quorumPercentage") ?? 50.00),
    passPercentage: Number(formData.get("passPercentage") ?? 50.00),
    nominationStartsAt: String(formData.get("nominationStartsAt") ?? "").trim() || undefined,
    nominationEndsAt: String(formData.get("nominationEndsAt") ?? "").trim() || undefined,
    minNomineeTenureMonths: Number(formData.get("minNomineeTenureMonths") ?? 0),
    requireGoodStandingForNominee: requireGoodStanding,
    requireNoArrearsForNominee: requireNoArrears,
    minSecondersRequired: Number(formData.get("minSecondersRequired") ?? 0),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    options,
    nomineeMemberIds,
  };

  if (!input.title) {
    return { error: "A title is required." };
  }
  if (!input.startsAt || !input.endsAt) {
    return { error: "Start and end dates are required." };
  }

  try {
    await apiFetch("/elections", { method: "POST", token, body: input });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/governance");
  return { error: null, success: true };
}

export async function transitionElectionStatusAction(
  electionId: string,
  status: ElectionStatus,
): Promise<FormActionState> {
  const { token } = await requireSession();
  try {
    await apiFetch(`/elections/${electionId}/status`, {
      method: "PATCH",
      token,
      body: { status },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/governance");
  revalidatePath(`/governance/elections/${electionId}`);
  return { error: null, success: true };
}

export async function vetNominationAction(
  nominationId: string,
  electionId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const input = {
    status: String(formData.get("status") ?? "APPROVED") as "APPROVED" | "REJECTED",
    rejectionReason: String(formData.get("rejectionReason") ?? "").trim() || undefined,
  };

  try {
    await apiFetch(`/elections/nominations/${nominationId}/vet`, {
      method: "POST",
      token,
      body: input,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath(`/governance/elections/${electionId}`);
  return { error: null, success: true };
}
