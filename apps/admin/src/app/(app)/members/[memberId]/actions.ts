"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { ChangeStatusResult, MemberStatus } from "@welfare/shared-types";

export interface ChangeStatusState {
  error: string | null;
  success?: boolean;
  // Set when a removal was queued for a second admin rather than applied
  // immediately (org has maker-checker on) — the dialog shows a different
  // confirmation for this than for an ordinary, already-applied change.
  pendingConfirmation?: boolean;
}

export async function changeMemberStatusAction(
  memberId: string,
  _prevState: ChangeStatusState,
  formData: FormData,
): Promise<ChangeStatusState> {
  const { token } = await requireSession();
  const status = String(formData.get("status") ?? "") as MemberStatus;
  const reason = String(formData.get("reason") ?? "").trim();

  if (status === "EXITED" && !reason) {
    return { error: "A reason is required when removing a member" };
  }

  let result: ChangeStatusResult;
  try {
    result = await apiFetch<ChangeStatusResult>(`/members/${memberId}/status`, {
      method: "PATCH",
      token,
      body: { status, reason: reason || undefined },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath(`/members/${memberId}`);
  revalidatePath("/members");
  revalidatePath("/members/removal-requests");
  return {
    error: null,
    success: true,
    pendingConfirmation: result.outcome === "pending_confirmation",
  };
}

// Reinstatement is just the ordinary status-change lever run in reverse —
// no separate endpoint. Low-risk enough (it's the undo of an over-cautious
// action, not a new one) to be a single click rather than a full dialog,
// same reasoning as AsyncActionButton's other one-click actions.
export async function reinstateMemberAction(memberId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/members/${memberId}/status`, {
    method: "PATCH",
    token,
    body: { status: "ACTIVE", reason: "Reinstated" },
  });
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/members");
}
