"use server";

import { redirect } from "next/navigation";
import type { AccessTokenResponse } from "@welfare/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { setPlatformSessionCookie } from "@/lib/platform-session";

export interface PlatformLoginState {
  error: string | null;
}

export async function platformLoginAction(
  _prevState: PlatformLoginState,
  formData: FormData,
): Promise<PlatformLoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  try {
    const { accessToken } = await apiFetch<AccessTokenResponse>("/platform/auth/login", {
      method: "POST",
      body: { email, password },
    });
    await setPlatformSessionCookie(accessToken);
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." };
  }

  redirect("/platform");
}
