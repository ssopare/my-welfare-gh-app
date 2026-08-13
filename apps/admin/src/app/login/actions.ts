"use server";

import { redirect } from "next/navigation";
import type { AccessTokenResponse, MyOrganisationMembership } from "@welfare/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { setSessionCookie } from "@/lib/session";

export interface LoginFormState {
  error: string | null;
  needsOrganisationId: boolean;
  organisations: MyOrganisationMembership[];
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const organisationId = String(formData.get("organisationId") ?? "").trim();

  if (!phoneNumber || !password) {
    return {
      error: "Enter your phone number and password.",
      needsOrganisationId: false,
      organisations: [],
    };
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
      // The password already checked out for the API to even reach this
      // case, so it's safe for the error body to carry the real
      // organisation list (see AuthService.login) — that's what lets this
      // render as a picker instead of a blind "type the id" field.
      const needsOrganisationId =
        error.status === 400 && error.message.toLowerCase().includes("multiple organisations");
      const body = error.body as { organisations?: MyOrganisationMembership[] } | null;
      return {
        error: error.message,
        needsOrganisationId,
        organisations: needsOrganisationId ? (body?.organisations ?? []) : [],
      };
    }
    return { error: "Something went wrong. Please try again.", needsOrganisationId: false, organisations: [] };
  }

  redirect("/");
}
