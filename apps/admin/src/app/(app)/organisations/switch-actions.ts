"use server";

import { redirect } from "next/navigation";
import type { AccessTokenResponse } from "@welfare/shared-types";
import { apiFetch } from "@/lib/api-client";
import { requireSession, setSessionCookie } from "@/lib/session";

// Reissues the session cookie scoped to a different organisation the
// caller's account already belongs to — no password needed, the existing
// session already proves who they are. Same reasoning and shape as
// createAdditionalOrganisationAction, just hitting /auth/organisations/switch
// instead of founding a new org. Lets someone actually switch groups
// instead of logging out and back in with that org's raw id.
export async function switchOrganisationAction(organisationId: string) {
  const { token } = await requireSession();

  const { accessToken } = await apiFetch<AccessTokenResponse>("/auth/organisations/switch", {
    method: "POST",
    token,
    body: { organisationId },
  });
  await setSessionCookie(accessToken);

  redirect("/");
}
