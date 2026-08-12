"use client";

import { useState } from "react";
import { ArrowLeft, LogIn, Sparkles } from "lucide-react";
import { JoinForm } from "./join-form";
import { RegisterForm } from "./register-form";

type Mode = "choose" | "create" | "join";

// The real fork the backend already has — register-organisation (found a
// new org, become its admin) vs join-organisation (join an existing one
// with a code, become a member) — presented as an explicit choice instead
// of a Member/Officer-style toggle that doesn't map to anything at this
// step. Client-only state, no routing, so the choice doesn't need its own
// URL.
export function OnboardingChooser() {
  const [mode, setMode] = useState<Mode>("choose");

  if (mode === "create") {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back
        </button>
        <div>
          <p className="text-base font-bold text-foreground">Create your welfare group</p>
          <p className="text-xs text-muted-foreground">You&apos;ll be the founding administrator.</p>
        </div>
        <RegisterForm />
      </div>
    );
  }

  if (mode === "join") {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back
        </button>
        <div>
          <p className="text-base font-bold text-foreground">Join your welfare group</p>
          <p className="text-xs text-muted-foreground">Use the code your association&apos;s admin gave you.</p>
        </div>
        <JoinForm />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-base font-bold text-foreground">Get started</p>
        <p className="text-xs text-muted-foreground">Are you starting a new group, or joining one that already exists?</p>
      </div>
      <button
        type="button"
        onClick={() => setMode("create")}
        className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-4 text-left transition hover:border-primary/40 hover:bg-accent"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <span>
          <span className="block text-sm font-bold text-foreground">Create a welfare group</span>
          <span className="block text-xs text-muted-foreground">Start a new organisation and become its admin.</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => setMode("join")}
        className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-4 text-left transition hover:border-primary/40 hover:bg-accent"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LogIn className="size-4" aria-hidden />
        </span>
        <span>
          <span className="block text-sm font-bold text-foreground">Join as a member</span>
          <span className="block text-xs text-muted-foreground">Use a join code from your group&apos;s admin.</span>
        </span>
      </button>
    </div>
  );
}
