"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

export async function updateOrgLogoAction(logoUrl: string | null): Promise<FormActionState> {
  const { token } = await requireSession();
  try {
    await apiFetch("/organisation", {
      method: "PATCH",
      token,
      body: { logoUrl: logoUrl ?? "" },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Could not update logo." };
  }
  revalidatePath("/settings");
  revalidatePath("/");
  return { error: null, success: true };
}

export async function updateOrgSettingsAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const payload: Record<string, string> = {};

  const allocationPolicy = String(formData.get("paymentAllocationPolicy") ?? "").trim();
  const authStrategy = String(formData.get("authStrategy") ?? "").trim();
  if (allocationPolicy) payload.paymentAllocationPolicy = allocationPolicy;
  if (authStrategy) payload.authStrategy = authStrategy;

  try {
    await apiFetch("/organisation", { method: "PATCH", token, body: payload });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Could not save settings." };
  }
  revalidatePath("/settings");
  return { error: null, success: true };
}
