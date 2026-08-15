"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginFormState } from "./actions";

const INITIAL_STATE: LoginFormState = { error: null, needsOrganisationId: false, organisations: [] };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phoneNumber" className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
          Phone number
        </Label>
        <Input
          id="phoneNumber"
          name="phoneNumber"
          type="tel"
          autoComplete="tel"
          placeholder="+233 20 000 0000"
          required
          className="h-11 border-muted-foreground/15 bg-background/40 px-3.5 backdrop-blur-sm transition-all duration-200 focus-visible:border-primary/50 focus-visible:ring-primary/20 dark:border-white/10"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            Password
          </Label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-primary/80 transition-colors hover:text-primary hover:underline underline-offset-4"
          >
            Forgot?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            className="h-11 border-muted-foreground/15 bg-background/40 pl-3.5 pr-10 backdrop-blur-sm transition-all duration-200 focus-visible:border-primary/50 focus-visible:ring-primary/20 dark:border-white/10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {state.error && (
        <div role="alert" className="rounded-xl border border-status-bad-border bg-status-bad-bg/60 px-4 py-3 text-sm text-status-bad backdrop-blur-sm">
          {state.error}
        </div>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="mt-2 h-11 w-full bg-gradient-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-lg shadow-violet-500/20 transition-all duration-300 hover:from-violet-500 hover:to-indigo-500 hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 dark:shadow-violet-950/20"
      >
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Signing in…
          </>
        ) : (
          <>
            <ShieldCheck aria-hidden className="size-4" />
            Sign in
          </>
        )}
      </Button>

      <p className="mt-2 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/register" className="font-semibold text-primary transition-all hover:underline underline-offset-4">
          Get started
        </Link>
      </p>
    </form>
  );
}
