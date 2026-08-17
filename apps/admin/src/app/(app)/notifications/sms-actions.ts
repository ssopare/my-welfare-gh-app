"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { SendTestSmsInput, SendBroadcastSmsInput } from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
  message?: string;
}

export async function sendTestSmsAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!phoneNumber || !message) {
    return { error: "Phone number and message are required." };
  }

  try {
    const result = await apiFetch<{ success: boolean; provider: string; error?: string }>(
      "/sms/test-send",
      {
        method: "POST",
        token,
        body: { phoneNumber, message } as SendTestSmsInput,
      },
    );

    if (!result.success) {
      return { error: result.error || "SMS dispatch failed." };
    }

    revalidatePath("/notifications");
    return {
      error: null,
      success: true,
      message: `SMS dispatched successfully via ${result.provider}.`,
    };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Failed to send test SMS." };
  }
}

export async function sendBroadcastSmsAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const message = String(formData.get("message") ?? "").trim();
  const recipientGroup = String(formData.get("recipientGroup") ?? "ACTIVE_MEMBERS") as
    | "ALL_MEMBERS"
    | "ACTIVE_MEMBERS"
    | "DEFAULTERS";

  if (!message) {
    return { error: "Broadcast message cannot be empty." };
  }

  try {
    const result = await apiFetch<{
      totalRecipients: number;
      successCount: number;
      failCount: number;
    }>("/sms/broadcast", {
      method: "POST",
      token,
      body: { message, recipientGroup } as SendBroadcastSmsInput,
    });

    revalidatePath("/notifications");
    return {
      error: null,
      success: true,
      message: `Broadcast complete: ${result.successCount} of ${result.totalRecipients} messages sent successfully.`,
    };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : "Broadcast dispatch failed." };
  }
}
