import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PlatformOperatorIdentity } from "@welfare/shared-types";
import { apiFetch } from "./api-client";

// A deliberately separate cookie from the tenant session — a platform
// operator and a tenant Member are structurally different actors on the
// API side (PlatformAuthGuard vs JwtAuthGuard, different JWT shape), and
// conflating their sessions here would make it possible to leak one
// browser's operator session into a tenant-console tab or vice versa.
const PLATFORM_SESSION_COOKIE = "wf_platform_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

export async function setPlatformSessionCookie(accessToken: string) {
  const store = await cookies();
  store.set(PLATFORM_SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearPlatformSessionCookie() {
  const store = await cookies();
  store.delete(PLATFORM_SESSION_COOKIE);
}

export async function getPlatformSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(PLATFORM_SESSION_COOKIE)?.value ?? null;
}

// Same "never trust cookie presence alone" reasoning as the tenant
// session — a real call to GET /platform/auth/me is what actually proves
// the token is still valid.
export async function getPlatformSession(): Promise<{
  token: string;
  operator: PlatformOperatorIdentity;
} | null> {
  const token = await getPlatformSessionToken();
  if (!token) return null;
  try {
    const operator = await apiFetch<PlatformOperatorIdentity>("/platform/auth/me", {
      token,
      cache: "no-store",
    });
    return { token, operator };
  } catch {
    return null;
  }
}

export async function requirePlatformSession(): Promise<{
  token: string;
  operator: PlatformOperatorIdentity;
}> {
  const session = await getPlatformSession();
  if (!session) {
    redirect("/platform/login");
  }
  return session;
}
