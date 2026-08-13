"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Organisation } from "@welfare/shared-types";

export interface BulkImportResult {
  successCount: number;
  errorCount: number;
  errors: string[];
}

export async function bulkCreateMembersAction(
  rows: { name: string; phoneNumber: string }[],
): Promise<BulkImportResult> {
  const { token } = await requireSession();

  // 1. Resolve current organisation joinCode
  const org = await apiFetch<Organisation>("/organisation", { token });
  const joinCode = org.joinCode;

  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  // 2. Sequentially register each member account
  for (const row of rows) {
    try {
      let sanitizedPhone = row.phoneNumber.trim().replace(/[-\s()]/g, "");
      if (!sanitizedPhone) {
        throw new Error("Phone number is empty after sanitization");
      }

      // If Excel stripped the leading zero (making it 9 digits instead of 10)
      if (sanitizedPhone.length === 9 && /^[1-9]/.test(sanitizedPhone)) {
        sanitizedPhone = "0" + sanitizedPhone;
      }

      await apiFetch("/auth/join-organisation", {
        method: "POST",
        body: {
          phoneNumber: sanitizedPhone,
          password: "tempPassword123!", // Default temporary password for mobile login
          joinCode: joinCode,
          name: row.name.trim(),
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
      errors.push(`Row (${row.name} - ${row.phoneNumber}): ${msg}`);
    }
  }

  revalidatePath("/members");
  return { successCount, errorCount, errors };
}

export async function bulkApproveMembersAction(
  memberIds: string[],
): Promise<{ successCount: number; errorCount: number }> {
  const { token } = await requireSession();

  let successCount = 0;
  let errorCount = 0;

  for (const id of memberIds) {
    try {
      await apiFetch(`/members/${id}/status`, {
        method: "PATCH",
        token,
        body: { status: "ACTIVE", reason: "Bulk approved by admin" },
      });
      successCount++;
    } catch (err) {
      errorCount++;
    }
  }

  revalidatePath("/members");
  return { successCount, errorCount };
}

