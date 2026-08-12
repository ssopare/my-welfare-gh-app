"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";

export interface ConfirmRemovalState {
  error: string | null;
  success?: boolean;
}

export async function confirmRemovalAction(
  requestId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ConfirmRemovalState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<ConfirmRemovalState> {
  const { token } = await requireSession();
  try {
    await apiFetch(`/members/removal-requests/${requestId}/confirm`, {
      method: "POST",
      token,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/members/removal-requests");
  revalidatePath("/members");
  return { error: null, success: true };
}

// Cancelling is safe/reversible (the member was never actually touched —
// see MemberRemovalRequest's schema comment), so it's a plain one-click
// AsyncActionButton rather than a confirmation dialog like confirm gets.
export async function cancelRemovalAction(requestId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/members/removal-requests/${requestId}/cancel`, {
    method: "POST",
    token,
  });
  revalidatePath("/members/removal-requests");
}
