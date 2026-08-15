import type { Metadata } from "next";
import { HeartHandshake, ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Welfare Platform",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-12 sm:px-6 lg:px-8">
      {/* Ambient background glows for Light/Dark mode */}
      <div 
        className="absolute inset-0 z-0 opacity-40 dark:opacity-75"
        style={{
          background: `
            radial-gradient(circle 800px at 100% -100px, color-mix(in oklab, var(--primary) 22%, transparent), transparent),
            radial-gradient(circle 800px at 0% 100%, color-mix(in oklab, var(--chart-2) 12%, transparent), transparent)
          `
        }}
        aria-hidden
      />

      {/* Structured grid pattern overlay for depth */}
      <div 
        className="absolute inset-0 z-0 bg-[linear-gradient(to_right,rgba(128,128,128,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)]"
        aria-hidden
      />

      {/* Main double-width card */}
      <div className="relative z-10 flex w-full max-w-[840px] overflow-hidden rounded-2xl border border-glass-border bg-glass-card/65 shadow-2xl backdrop-blur-xl transition-all duration-300 dark:bg-glass-card/45">
        
        {/* Left Column: Visual Panel (visible on md+) */}
        <div 
          className="relative hidden w-1/2 flex-col justify-between p-10 md:flex bg-cover bg-center"
          style={{
            backgroundImage: "url(/welfare_login_bg.png)",
            backgroundPosition: "center 22%",
          }}
        >
          {/* Premium color wash overlay to blend with kente pattern */}
          <div className="absolute inset-0 bg-gradient-to-t from-indigo-950/90 via-indigo-950/65 to-violet-900/40" />

          {/* Logo Header */}
          <div className="relative z-10 flex items-center gap-2 text-white">
            <span className="flex size-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur-md">
              <HeartHandshake className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-bold tracking-wide">My Welfare</span>
          </div>

          {/* Captions and branding text */}
          <div className="relative z-10 text-white">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight">
              Contribute together.
              <br />
              <span className="bg-gradient-to-r from-violet-300 to-pink-300 bg-clip-text text-transparent">
                Care for each other.
              </span>
            </h1>
            <p className="mt-3 text-xs text-zinc-300 max-w-[280px]">
              One platform for your welfare association&apos;s dues, benefits and claims.
            </p>
          </div>
        </div>

        {/* Right Column: Form Panel */}
        <div className="w-full p-8 sm:p-10 md:w-1/2">
          {/* Brand Logo for Mobile View (hidden on md+) */}
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <HeartHandshake className="size-4" aria-hidden />
            </div>
            <span className="text-sm font-extrabold text-foreground">My Welfare</span>
          </div>

          {/* Title Header */}
          <div className="mb-6 flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Welcome back</p>
              <p className="text-xs text-muted-foreground">Sign in to manage your welfare fund</p>
            </div>
          </div>

          <LoginForm />
        </div>

      </div>
    </div>
  );
}
