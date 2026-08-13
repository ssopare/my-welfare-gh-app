"use server";

import { redirect } from "next/navigation";
import type { AccessTokenResponse } from "@welfare/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { requireSession, setSessionCookie } from "@/lib/session";

export interface CreateOrganisationFormState {
  error: string | null;
}

// Any logged-in account — Admin or Member, in this org or any other — can
// found a brand-new organisation and become its founding Admin there. Its
// existing membership(s) elsewhere are untouched; this just adds another
// one. Since every session here is single-org, the new token this returns
// immediately replaces the current one, landing the caller in the new
// organisation's context (same as register/login) — switching back to a
// previous org is now just the sidebar organisation switcher
// (switch-actions.ts), not a re-login.
export async function createAdditionalOrganisationAction(
  _prevState: CreateOrganisationFormState,
  formData: FormData,
): Promise<CreateOrganisationFormState> {
  const legalName = String(formData.get("legalName") ?? "").trim();
  const organisationType = String(formData.get("organisationType") ?? "").trim();

  if (!legalName || !organisationType) {
    return { error: "Please fill in every field." };
  }

  const { token } = await requireSession();

  try {
    const { accessToken } = await apiFetch<AccessTokenResponse>("/auth/organisations", {
      method: "POST",
      token,
      body: { legalName, organisationType },
    });
    await setSessionCookie(accessToken);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/");
}
