"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registerAction, type RegisterFormState } from "./actions";

const INITIAL_STATE: RegisterFormState = { error: null };

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="legalName">Organisation name</Label>
        <Input
          id="legalName"
          name="legalName"
          autoComplete="organization"
          placeholder="e.g. St. Joseph Staff Welfare Association"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="organisationType">Organisation type</Label>
        <Select name="organisationType" defaultValue="voluntary" required>
          <SelectTrigger id="organisationType" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="voluntary">Voluntary association</SelectItem>
            <SelectItem value="employer-linked">Employer-linked scheme</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          placeholder="e.g. Kofi Mensah"
          required
        />
        <p className="text-xs text-muted-foreground">
          Carries through every organisation you&apos;re a member of.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phoneNumber">Your phone number</Label>
        <Input
          id="phoneNumber"
          name="phoneNumber"
          type="tel"
          autoComplete="tel"
          placeholder="+233 20 000 0000"
          required
        />
        <p className="text-xs text-muted-foreground">
          You&apos;ll be the founding administrator, signed in with this number.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="mt-1 w-full">
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Creating your organisation…
          </>
        ) : (
          <>
            <Sparkles aria-hidden />
            Create organisation
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
