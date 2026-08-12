"use server";

import { redirect } from "next/navigation";
import type { AccessTokenResponse } from "@welfare/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { setSessionCookie } from "@/lib/session";

export interface LoginFormState {
  error: string | null;
  needsOrganisationId: boolean;
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const organisationId = String(formData.get("organisationId") ?? "").trim();

  if (!phoneNumber || !password) {
    return { error: "Enter your phone number and password.", needsOrganisationId: false };
  }

  try {
    const { accessToken } = await apiFetch<AccessTokenResponse>("/auth/login", {
      method: "POST",
      body: {
        phoneNumber,
        password,
        ...(organisationId ? { organisationId } : {}),
      },
    });
    await setSessionCookie(accessToken);
  } catch (error) {
    if (error instanceof ApiError) {
      // The API's own signal that this phone number belongs to more than
      // one organisation and needs disambiguating — surfaced as a second
      // field rather than asking every member to specify one up front.
      const needsOrganisationId =
        error.status === 400 && error.message.toLowerCase().includes("multiple organisations");
      return { error: error.message, needsOrganisationId };
    }
    return { error: "Something went wrong. Please try again.", needsOrganisationId: false };
  }

  redirect("/");
}
