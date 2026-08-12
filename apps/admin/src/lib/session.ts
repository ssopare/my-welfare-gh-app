import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthIdentity } from "@welfare/shared-types";
import { apiFetch } from "./api-client";

// httpOnly so the browser's own JS can never read the token — the whole
// point of the server-to-server architecture. 1-day expiry matches the
// API's own JWT signOptions (JwtModule.register({ signOptions: { expiresIn:
// "1d" } })) — no reason for the cookie to outlive the token it holds.
const SESSION_COOKIE = "wf_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

export async function setSessionCookie(accessToken: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

// Never trusts the cookie's mere presence as proof of a valid session —
// asks the API, which is the only thing that can actually verify the JWT
// signature and expiry. A little more latency per page load in exchange
// for never rendering against a token the API would already reject.
export async function getSession(): Promise<{
  token: string;
  identity: AuthIdentity;
} | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const identity = await apiFetch<AuthIdentity>("/auth/me", {
      token,
      cache: "no-store",
    });
    return { token, identity };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<{
  token: string;
  identity: AuthIdentity;
}> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

// Every seeded org's founding admin holds the Org Admin role (wildcard
// permission) — this mirrors the API's own JWT `role` claim, which is
// display-only there too (see access.util.ts: real authorization is a live
// RbacService check, never this field). Good enough to decide what to show
// in the UI; never used as an actual authorization decision here either —
// every real permission check still happens API-side.
export function isAdmin(identity: AuthIdentity): boolean {
  return identity.role === "ADMIN";
}
