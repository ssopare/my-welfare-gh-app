"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, apiFetchOrNull, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type {
  Fund,
  Obligation,
  PaymentAllocationPolicy,
  RecordContributionPaymentInput,
  RecordContributionPaymentResult,
} from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

// The admin console is server-to-server (see lib/api-client's own comment
// on why) — a client component can't fetch this from the browser, so
// RecordPaymentDialog calls this Server Action directly instead, the same
// way it submits the form itself.
export async function listOpenObligationsAction(memberId: string): Promise<Obligation[]> {
  const { token } = await requireSession();
  const obligations = await apiFetchOrNull<Obligation[]>(`/members/${memberId}/obligations`, {
    token,
    cache: "no-store",
  });
  const openStatuses = new Set(["UPCOMING", "DUE", "PARTIALLY_PAID", "OVERDUE"]);
  return (obligations ?? []).filter((o) => openStatuses.has(o.status));
}

export async function recordPaymentAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const obligationIds = formData.getAll("obligationIds").map(String).filter(Boolean);
  const input: RecordContributionPaymentInput = {
    memberId: String(formData.get("memberId") ?? ""),
    fundId: String(formData.get("fundId") ?? ""),
    amountValue: String(formData.get("amountValue") ?? "").trim(),
    currency: String(formData.get("currency") ?? "GHS").trim(),
    reference: String(formData.get("reference") ?? "").trim() || undefined,
    obligationIds: obligationIds.length > 0 ? obligationIds : undefined,
  };

  if (!input.memberId || !input.fundId || !input.amountValue) {
    return { error: "Member, fund, and amount are required." };
  }

  try {
    await apiFetch<RecordContributionPaymentResult>("/payments/contribution", {
      method: "POST",
      token,
      body: input,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/ledger");
  return { error: null, success: true };
}

// A fund's chart of accounts (Cash, Contributions Income, Benefits
// Payable/Expense, Fund Equity) is provisioned automatically the moment
// this succeeds — see FundService.create — so there's nothing else for
// this form to configure beyond the name.
export async function createFundAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "A name is required." };
  }

  try {
    await apiFetch<Fund>("/funds", {
      method: "POST",
      token,
      body: { name },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/ledger");
  return { error: null, success: true };
}

export async function updatePaymentAllocationPolicyAction(
  policy: PaymentAllocationPolicy,
): Promise<void> {
  const { token } = await requireSession();
  await apiFetch("/organisation", {
    method: "PATCH",
    token,
    body: { paymentAllocationPolicy: policy },
  });
  revalidatePath("/ledger");
}

export async function reverseJournalEntryAction(
  entryId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) {
    return { error: "A reason is required." };
  }

  try {
    await apiFetch(`/journal-entries/${entryId}/reverse`, {
      method: "POST",
      token,
      body: { reason },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/ledger");
  return { error: null, success: true };
}

export async function resolveReconciliationExceptionAction(exceptionId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/reconciliation-exceptions/${exceptionId}/resolve`, {
    method: "PATCH",
    token,
    body: {},
  });
  revalidatePath("/ledger/reconciliation");
}
