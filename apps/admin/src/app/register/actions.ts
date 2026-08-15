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
  // Not required client-side, same reasoning as joinAction: a returning
  // phone number doesn't render a Name field at all (see RegisterForm's
  // accountExists check), so this can legitimately arrive empty.
  // AuthService.registerOrganisation is the real gate.
  const name = String(formData.get("name") ?? "").trim();

  if (!legalName || !organisationType || !phoneNumber || !password) {
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

// Backs the phone-number-exists check on JoinForm — same public,
// side-effect-free /auth/check-phone lookup the mobile app's JoinScreen
// uses to decide whether to show the Name field at all. No auth needed;
// this only ever reveals whether an Account with this number exists, not
// who it belongs to (see AuthService.checkPhoneExists).
export async function checkPhoneAction(phoneNumber: string): Promise<{ exists: boolean }> {
  return apiFetch<{ exists: boolean }>("/auth/check-phone", {
    method: "POST",
    body: { phoneNumber },
  });
}

export async function getOrganisationByCodeAction(joinCode: string): Promise<{ id: string; legalName: string; authStrategy: string }> {
  return apiFetch<{ id: string; legalName: string; authStrategy: string }>("/auth/organisation-by-code", {
    method: "POST",
    body: { joinCode },
  });
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
  const otpCode = String(formData.get("otpCode") ?? "").trim();

  if (!joinCode || !phoneNumber) {
    return { error: "Please fill in every field." };
  }

  // Lookup the organisation strategy first
  let strategy = "PASSWORD_ONLY";
  try {
    const org = await apiFetch<{ authStrategy: string }>("/auth/organisation-by-code", {
      method: "POST",
      body: { joinCode },
    });
    strategy = org.authStrategy;
  } catch (error) {
    return { error: "Invalid join code." };
  }

  if (strategy === "PASSWORD_ONLY" || strategy === "PASSWORD_AND_OTP") {
    if (!password) {
      return { error: "Please enter your password." };
    }
    if (password.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }
  }

  if (strategy === "OTP_ONLY" || strategy === "PASSWORD_AND_OTP") {
    if (!otpCode) {
      return { error: "Please enter the SMS OTP code." };
    }
  }

  try {
    const { accessToken } = await apiFetch<AccessTokenResponse>(
      "/auth/join-organisation",
      {
        method: "POST",
        body: {
          joinCode,
          name,
          phoneNumber,
          password: (strategy === "PASSWORD_ONLY" || strategy === "PASSWORD_AND_OTP") ? password : undefined,
          otpCode: (strategy === "OTP_ONLY" || strategy === "PASSWORD_AND_OTP") ? otpCode : undefined,
        },
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
