"use server";

import { redirect } from "next/navigation";
import type { AccessTokenResponse } from "@welfare/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { setSessionCookie } from "@/lib/session";

export interface RegisterFormState {
  error: string | null;
}

export async function registerAction(
  _prevState: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const legalName = String(formData.get("legalName") ?? "").trim();
  const organisationType = String(formData.get("organisationType") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!legalName || !organisationType || !phoneNumber || !password || !name) {
    return { error: "Please fill in every field." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  try {
    const { accessToken } = await apiFetch<AccessTokenResponse>(
      "/auth/register-organisation",
      {
        method: "POST",
        body: { legalName, organisationType, phoneNumber, password, name },
      },
    );
    await setSessionCookie(accessToken);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/");
}

export interface JoinFormState {
  error: string | null;
}

// The member-facing counterpart to registerAction above — joining an
// *existing* organisation with a join code, rather than founding a new
// one. Previously only available from the mobile app (see the doc
// comment history on JoinScreen); exposed here too now that onboarding
// presents both paths as an explicit choice on every platform.
export async function joinAction(
  _prevState: JoinFormState,
  formData: FormData,
): Promise<JoinFormState> {
  const joinCode = String(formData.get("joinCode") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!joinCode || !name || !phoneNumber || !password) {
    return { error: "Please fill in every field." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  try {
    const { accessToken } = await apiFetch<AccessTokenResponse>(
      "/auth/join-organisation",
      {
        method: "POST",
        body: { joinCode, name, phoneNumber, password },
      },
    );
    await setSessionCookie(accessToken);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/");
}
