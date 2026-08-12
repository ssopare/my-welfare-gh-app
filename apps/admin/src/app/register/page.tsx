import type { Metadata } from "next";
import { HeartHandshake } from "lucide-react";
import { OnboardingChooser } from "./onboarding-chooser";

export const metadata: Metadata = {
  title: "Get started — Welfare Platform",
};

// Same light/dark shell as /login (see that page's comment) — this one
// hosts the onboarding chooser instead of the sign-in form.
export default function RegisterPage() {
  return (
    <div className="min-h-svh">
      {/* ---------------- LIGHT ---------------- */}
      <div className="dark:hidden min-h-svh bg-white">
        <div className="flex items-center gap-2 px-6 py-4 sm:px-10">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400 to-primary text-primary-foreground">
            <HeartHandshake className="size-4" aria-hidden />
          </span>
          <span className="text-sm font-bold text-foreground">My Welfare</span>
        </div>

        <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-6 pt-6 sm:px-10 lg:flex-row lg:items-start">
          <div className="w-full lg:w-[42%]">
            <span className="mb-4 inline-block rounded-full bg-accent px-3 py-1 text-xs font-bold text-primary">
              Trusted · Secure · Community
            </span>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              Welcome to
              <br />
              <span className="text-primary">My Welfare.</span>
            </h1>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              One platform for your welfare association&apos;s dues, benefits and claims.
            </p>
          </div>

          <div className="relative w-full lg:flex-1">
            <div
              className="h-52 w-full rounded-2xl sm:h-72"
              style={{
                backgroundImage: "url(/welfare_login_bg.png)",
                backgroundSize: "cover",
                backgroundPosition: "center 22%",
              }}
              aria-hidden
            />
            <div className="relative -mt-16 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5 lg:absolute lg:right-4 lg:top-4 lg:mt-0">
              <OnboardingChooser />
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- DARK ---------------- */}
      <div className="hidden min-h-svh dark:flex">
        <div
          className="relative hidden w-[42%] flex-col justify-between overflow-hidden p-10 lg:flex"
          style={{
            background:
              "radial-gradient(70% 60% at 20% 15%, color-mix(in oklab, var(--primary) 35%, transparent), transparent 60%), radial-gradient(60% 50% at 90% 85%, color-mix(in oklab, var(--chart-2) 18%, transparent), transparent 60%), var(--background)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HeartHandshake className="size-4" aria-hidden />
            </span>
            <span className="text-base font-bold text-foreground">My Welfare</span>
          </div>
          <div>
            <p className="mb-3 text-2xl font-bold leading-snug text-foreground">
              Welcome to
              <br />
              <span className="text-primary">My Welfare.</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["Secure", "Auditable", "Role-based"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center bg-background px-6 py-10">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <HeartHandshake className="size-4" aria-hidden />
              </span>
              <span className="text-sm font-bold text-foreground">My Welfare</span>
            </div>
            <div className="rounded-2xl border border-glass-border bg-glass-card/65 p-7 shadow-lg backdrop-blur-xl">
              <OnboardingChooser />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
