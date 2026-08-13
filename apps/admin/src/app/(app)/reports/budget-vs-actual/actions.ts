"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Budget } from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

// Actual is computed server-side, fresh, every time this list is fetched
// (BudgetService.listWithActuals) — a Budget row itself is only ever the
// target amount, never the actual.
export async function createBudgetAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();
  const ledgerAccountId = String(formData.get("ledgerAccountId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || undefined;
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  const amountValue = String(formData.get("amountValue") ?? "").trim();

  if (!ledgerAccountId || !periodStart || !periodEnd || !amountValue) {
    return { error: "Account, period, and amount are all required." };
  }

  try {
    await apiFetch<Budget>("/budgets", {
      method: "POST",
      token,
      body: { ledgerAccountId, name, periodStart, periodEnd, amountValue },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/reports/budget-vs-actual");
  return { error: null, success: true };
}

export async function deleteBudgetAction(budgetId: string): Promise<void> {
  const { token } = await requireSession();
  await apiFetch(`/budgets/${budgetId}`, { method: "DELETE", token });
  revalidatePath("/reports/budget-vs-actual");
}
