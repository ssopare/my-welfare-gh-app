import type { Metadata } from "next";
import { Building2, Settings, Shield, Wallet2 } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { OrgLogoUploader } from "@/components/dashboard/org-logo-uploader";
import { apiFetch } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Organisation } from "@welfare/shared-types";
import { updateOrgLogoAction, updateOrgSettingsAction } from "./actions";
import { OrgSettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Settings — Welfare Platform",
};

export default async function SettingsPage() {
  const { token } = await requireSession();
  const org = await apiFetch<Organisation>("/organisation", { token, cache: "no-store" });

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Organisation Settings"
        subtitle="Manage your group's branding, authentication, and payment rules."
        icon={Settings}
        theme="blue"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── Logo & Branding ── */}
        <div className="rounded-xl border border-glass-border bg-glass-card/35 backdrop-blur-md p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Branding
            </h2>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">Group Logo</span>
            <span className="text-xs text-muted-foreground mb-3">
              Displayed in the mobile app and on receipts. Recommended: 256 × 256 px.
            </span>
            <OrgLogoUploader
              currentLogoUrl={org.logoUrl}
              apiBaseUrl={apiBaseUrl}
              onSave={async (logoUrl) => {
                "use server";
                await updateOrgLogoAction(logoUrl);
              }}
            />
          </div>

          <div className="flex flex-col gap-1 pt-2 border-t border-border">
            <span className="text-sm font-medium text-foreground">Organisation Name</span>
            <span className="text-base font-bold text-foreground">{org.legalName}</span>
            <span className="text-xs text-muted-foreground">
              Contact support to change the legal name.
            </span>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span className="text-sm font-medium text-foreground">Join Code</span>
            <code className="text-base font-mono font-bold text-indigo-500 tracking-widest">
              {org.joinCode}
            </code>
            <span className="text-xs text-muted-foreground">
              Share this with members so they can join on the mobile app.
            </span>
          </div>
        </div>

        {/* ── Auth & Payment Settings ── */}
        <div className="rounded-xl border border-glass-border bg-glass-card/35 backdrop-blur-md p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Authentication &amp; Payments
            </h2>
          </div>
          <OrgSettingsForm
            currentAuthStrategy={org.authStrategy}
            currentAllocationPolicy={org.paymentAllocationPolicy}
            action={updateOrgSettingsAction}
          />
        </div>

      </div>

      {/* ── Read-only info cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Type", value: org.type, icon: Building2 },
          { label: "Country", value: org.country, icon: Shield },
          { label: "Currency", value: org.currency, icon: Wallet2 },
          { label: "Status", value: org.status.charAt(0).toUpperCase() + org.status.slice(1), icon: Shield },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-glass-border bg-glass-card/35 backdrop-blur-md p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5" />
              {label}
            </div>
            <span className="font-semibold text-sm text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
