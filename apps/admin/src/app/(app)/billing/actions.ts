"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Subscription } from "@welfare/shared-types";

export interface FormActionState {
  error: string | null;
  success?: boolean;
}

// prevState/formData are unused — this action takes no form fields, only
// the bound planId — but both are required for the useActionState calling
// convention on the client side.
export async function convertPlanAction(
  planId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: FormActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<FormActionState> {
  const { token } = await requireSession();

  try {
    await apiFetch<Subscription>("/subscription/convert", {
      method: "POST",
      token,
      body: { planId },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  revalidatePath("/billing");
  revalidatePath("/");
  return { error: null, success: true };
}
