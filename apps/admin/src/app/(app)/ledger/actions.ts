"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, apiFetchOrNull, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type {
  CreateLedgerAccountInput,
  Fund,
  LedgerAccount,
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

// Posts two linked entries server-side (LedgerService.transferBetweenFunds)
// against each fund's Cash and Fund Equity accounts — see that method's
// comment for why Equity, not a new account type. Nothing to configure
// here beyond which funds and how much.
export async function transferFundsAction(
  fromFundId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const toFundId = String(formData.get("toFundId") ?? "");
  const amountValue = String(formData.get("amountValue") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || undefined;

  if (!toFundId || !amountValue) {
    return { error: "Destination fund and amount are required." };
  }

  try {
    await apiFetch(`/funds/${fromFundId}/transfer`, {
      method: "POST",
      token,
      body: { toFundId, amountValue, description },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/ledger");
  return { error: null, success: true };
}

// Extends a fund's flat chart of accounts beyond the standard 6 —
// FundService.createAccount rejects a duplicate name on the same fund and
// requires admin. isAdministrative only matters for an EXPENSE account
// (see ReportingService.managementRatiosAndHealth): flagging one is what
// turns the Expense Ratio / Administrative Cost Ratio on.
export async function createLedgerAccountAction(
  fundId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "") as CreateLedgerAccountInput["type"];
  const isAdministrative = formData.get("isAdministrative") === "on";

  if (!name || !type) {
    return { error: "Name and type are both required." };
  }

  try {
    await apiFetch<LedgerAccount>(`/funds/${fundId}/accounts`, {
      method: "POST",
      token,
      body: { name, type, isAdministrative: type === "EXPENSE" ? isAdministrative : undefined },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/reports/chart-of-accounts");
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

export interface BulkPaymentRow {
  memberId: string;
  fundId: string;
  amountValue: string;
  reference?: string;
  namePreview: string;
}

export interface BulkPaymentResult {
  successCount: number;
  errorCount: number;
  errors: string[];
}

export async function bulkRecordPaymentsAction(
  rows: BulkPaymentRow[],
): Promise<BulkPaymentResult> {
  const { token } = await requireSession();

  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      await apiFetch("/payments/contribution", {
        method: "POST",
        token,
        body: {
          memberId: row.memberId,
          fundId: row.fundId,
          amountValue: row.amountValue,
          currency: "GHS",
          reference: row.reference || undefined,
        },
      });
      successCount++;
    } catch (err) {
      errorCount++;
      const msg = err instanceof ApiError 
        ? err.message 
        : err instanceof Error 
          ? err.message 
          : "Network error";
      errors.push(`Row (${row.namePreview} - GHS ${row.amountValue}): ${msg}`);
    }
  }

  revalidatePath("/ledger");
  return { successCount, errorCount, errors };
}

