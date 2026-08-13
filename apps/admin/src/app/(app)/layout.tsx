import type { ReactNode } from "react";
import type {
  MyOrganisationMembership,
  Notification,
  Organisation,
  Subscription,
} from "@welfare/shared-types";
import { AppShell } from "@/components/shell/app-shell";
import { apiFetch, apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { token, identity } = await requireSession();

  const [organisation, notifications, subscription, myOrganisations] = await Promise.all([
    apiFetch<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetch<Notification[]>(`/members/${identity.memberId}/notifications`, {
      token,
      cache: "no-store",
    }),
    // Subscription details are admin-gated API-side (requireAdmin) — a
    // Treasurer or other non-"ADMIN" officer can still use this console
    // under their own real RBAC permissions, so this degrades quietly
    // rather than breaking the whole shell for anyone who isn't the
    // founding admin specifically.
    apiFetchOrNull<Subscription>("/subscription", { token, cache: "no-store" }),
    apiFetch<MyOrganisationMembership[]>("/auth/organisations", { token, cache: "no-store" }),
  ]);

  return (
    <AppShell
      organisationName={organisation.legalName}
      subscriptionStatus={subscription?.status ?? "TRIAL"}
      role={identity.role}
      notifications={notifications}
      myOrganisations={myOrganisations}
    >
      {children}
    </AppShell>
  );
}
