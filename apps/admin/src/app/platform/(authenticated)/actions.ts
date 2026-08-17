"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requirePlatformSession } from "@/lib/platform-session";
import type {
  CreateSubscriptionPlanInput,
  NotificationChannelSetting,
  Subscription,
  SubscriptionPlan,
  UpdateNotificationChannelSettingInput,
  UpdateSubscriptionStatusInput,
} from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

export async function updateSubscriptionStatusAction(
  organisationId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requirePlatformSession();
  const currentPeriodEnd = String(formData.get("currentPeriodEnd") ?? "").trim();
  const input: UpdateSubscriptionStatusInput = {
    status: String(formData.get("status") ?? "") as UpdateSubscriptionStatusInput["status"],
    currentPeriodEnd: currentPeriodEnd || undefined,
  };

  try {
    await apiFetch<Subscription>(`/platform/organisations/${organisationId}/subscription`, {
      method: "PATCH",
      token,
      body: input,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/platform");
  return { error: null, success: true };
}

export async function createSubscriptionPlanAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requirePlatformSession();
  const trialDaysRaw = String(formData.get("trialDays") ?? "").trim();
  const platformFeePercentageRaw = String(formData.get("platformFeePercentage") ?? "").trim();
  const includedModules = formData.getAll("includedModules").map((v) => String(v));
  const input: CreateSubscriptionPlanInput = {
    name: String(formData.get("name") ?? "").trim(),
    priceAmount: String(formData.get("priceAmount") ?? "").trim(),
    currency: String(formData.get("currency") ?? "GHS").trim(),
    billingCadence: String(formData.get("billingCadence") ?? "monthly"),
    trialDays: trialDaysRaw ? Number.parseInt(trialDaysRaw, 10) : undefined,
    platformFeePercentage: platformFeePercentageRaw || undefined,
    includedModules: includedModules.length ? includedModules : undefined,
  };

  if (!input.name || !input.priceAmount) {
    return { error: "Name and price are required." };
  }

  try {
    await apiFetch<SubscriptionPlan>("/platform/subscription-plans", {
      method: "POST",
      token,
      body: input,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/platform/plans");
  return { error: null, success: true };
}

export async function archivePlanAction(planId: string): Promise<void> {
  const { token } = await requirePlatformSession();
  await apiFetch(`/platform/subscription-plans/${planId}/archive`, { method: "PATCH", token, body: {} });
  revalidatePath("/platform/plans");
}

export async function toggleNotificationChannelSmsAction(
  notificationType: string,
  smsEnabled: boolean,
): Promise<void> {
  const { token } = await requirePlatformSession();
  const input: UpdateNotificationChannelSettingInput = { smsEnabled };
  await apiFetch<NotificationChannelSetting>(`/platform/notification-channel-settings/${notificationType}`, {
    method: "PATCH",
    token,
    body: input,
  });
  revalidatePath("/platform/notifications");
}
