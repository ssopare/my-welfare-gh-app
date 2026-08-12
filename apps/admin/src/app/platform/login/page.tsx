import type { Metadata } from "next";
import { Server } from "lucide-react";
import { PlatformLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Platform Operator — Welfare Platform",
};

// Deliberately not the tenant-brand emerald treatment (see login/page.tsx)
// — a muted slate badge instead, so this never reads as "just another
// organisation's login" to whoever's looking at the screen. Same
// glassmorphic auth-screen pattern otherwise, since that principle isn't
// actor-specific.
export default function PlatformLoginPage() {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 20%, color-mix(in oklab, var(--muted) 80%, transparent) 0%, transparent 70%), radial-gradient(50% 45% at 85% 80%, color-mix(in oklab, var(--secondary) 70%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
            <Server className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Platform Operator</h1>
            <p className="text-sm text-muted-foreground">Cross-tenant subscription &amp; plan management</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-7 shadow-lg backdrop-blur-xl">
          <PlatformLoginForm />
        </div>
      </div>
    </div>
  );
}
