"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type {
  SettlementAccount,
  FundControlPolicy,
  PayoutRecipient,
  PayoutRequest,
} from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

export async function saveSettlementAccountAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const momoProvider = String(formData.get("momoProvider") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const accountName = String(formData.get("accountName") ?? "").trim();

  if (!momoProvider || !phoneNumber || !accountName) {
    return { error: "Network, MoMo number, and account name are required." };
  }

  try {
    await apiFetch<SettlementAccount>("/payouts/settlement-account", {
      method: "POST",
      token,
      body: { momoProvider, phoneNumber, accountName },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/ledger/payouts");
  return { error: null, success: true };
}

export async function savePolicyAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const dailyLimitValue = String(formData.get("dailyLimitValue") ?? "").trim();
  const monthlyLimitValue = String(formData.get("monthlyLimitValue") ?? "").trim();
  const thresholdOneApproverValue = String(formData.get("thresholdOneApproverValue") ?? "").trim();
  const thresholdTwoApproversValue = String(formData.get("thresholdTwoApproversValue") ?? "").trim();
  // Checkboxes are only present in FormData when checked.
  const autoDisbursement = formData.get("autoDisbursement") === "on";

  if (!dailyLimitValue || !monthlyLimitValue || !thresholdOneApproverValue || !thresholdTwoApproversValue) {
    return { error: "All limits and thresholds are required." };
  }

  try {
    await apiFetch<FundControlPolicy>("/payouts/policy", {
      method: "POST",
      token,
      body: {
        dailyLimitValue,
        monthlyLimitValue,
        thresholdOneApproverValue,
        thresholdTwoApproversValue,
        autoDisbursement,
      },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/ledger/payouts");
  return { error: null, success: true };
}

export async function createRecipientAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const momoProvider = String(formData.get("momoProvider") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();

  if (!name || !accountNumber || !momoProvider) {
    return { error: "Name, MoMo number, and network are required." };
  }

  try {
    await apiFetch<PayoutRecipient>("/payouts/recipients", {
      method: "POST",
      token,
      body: { name, momoProvider, accountNumber },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/ledger/payouts");
  return { error: null, success: true };
}

export async function createPayoutRequestAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const amountValue = String(formData.get("amountValue") ?? "").trim();
  const fundId = String(formData.get("fundId") ?? "");
  const recipientId = String(formData.get("recipientId") ?? "");
  const purpose = String(formData.get("purpose") ?? "").trim();

  if (!amountValue || !fundId || !recipientId || !purpose) {
    return { error: "Amount, fund, recipient, and purpose are required." };
  }

  try {
    await apiFetch<PayoutRequest>("/payouts/requests", {
      method: "POST",
      token,
      body: { amountValue, fundId, recipientId, purpose },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/ledger/payouts");
  revalidatePath("/ledger");
  return { error: null, success: true };
}

export async function approvePayoutRequestAction(
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  comment: string,
): Promise<FormActionState> {
  const { token } = await requireSession();

  try {
    await apiFetch<PayoutRequest>(`/payouts/requests/${requestId}/approve`, {
      method: "POST",
      token,
      body: { decision, comment },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/ledger/payouts");
  revalidatePath("/ledger");
  return { error: null, success: true };
}
