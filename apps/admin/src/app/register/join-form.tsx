"use client";

import { useActionState, useState, type FocusEvent } from "react";
import Link from "next/link";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthStrategy } from "@welfare/shared-types";
import { checkPhoneAction, joinAction, getOrganisationByCodeAction, type JoinFormState } from "./actions";

const INITIAL_STATE: JoinFormState = { error: null };

export function JoinForm() {
  const [state, formAction, isPending] = useActionState(joinAction, INITIAL_STATE);
  // null = not checked yet, true/false = result of the last check-phone
  // call. Mirrors the mobile app's JoinScreen: a returning phone number
  // shouldn't have to supply a name again, since Account.name already
  // carries through every organisation it's a member of — this is what
  // decides whether the Name field below renders at all.
  const [accountExists, setAccountExists] = useState<boolean | null>(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [lastCheckedPhone, setLastCheckedPhone] = useState("");

  const [authStrategy, setAuthStrategy] = useState<AuthStrategy>("PASSWORD_ONLY");
  const [joinCodeOrgName, setJoinCodeOrgName] = useState<string | null>(null);
  const [isCheckingJoinCode, setIsCheckingJoinCode] = useState(false);

  async function handlePhoneBlur(event: FocusEvent<HTMLInputElement>) {
    const phone = event.target.value.trim();
    if (!phone || phone === lastCheckedPhone) return;
    setIsCheckingPhone(true);
    try {
      const { exists } = await checkPhoneAction(phone);
      setLastCheckedPhone(phone);
      setAccountExists(exists);
    } finally {
      setIsCheckingPhone(false);
    }
  }

  async function handleJoinCodeBlur(event: FocusEvent<HTMLInputElement>) {
    const code = event.target.value.trim().toUpperCase();
    if (!code) return;
    setIsCheckingJoinCode(true);
    try {
      const org = await getOrganisationByCodeAction(code);
      setAuthStrategy(org.authStrategy as AuthStrategy);
      setJoinCodeOrgName(org.legalName);
    } catch (error) {
      setJoinCodeOrgName(null);
      setAuthStrategy("PASSWORD_ONLY");
    } finally {
      setIsCheckingJoinCode(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="joinCode">Join code</Label>
        <Input
          id="joinCode"
          name="joinCode"
          autoCapitalize="characters"
          placeholder="e.g. SJ-4K7P2"
          required
          onBlur={handleJoinCodeBlur}
        />
        {isCheckingJoinCode && <p className="text-xs text-muted-foreground">Looking up group strategy…</p>}
        {joinCodeOrgName && (
          <p className="text-xs text-primary font-semibold">
            Joining: {joinCodeOrgName}
          </p>
        )}
        {!joinCodeOrgName && !isCheckingJoinCode && (
          <p className="text-xs text-muted-foreground">Ask your welfare association&apos;s admin for this.</p>
        )}
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
          onBlur={handlePhoneBlur}
        />
        {isCheckingPhone && <p className="text-xs text-muted-foreground">Checking…</p>}
        {accountExists === true && !isCheckingPhone && (
          <p className="text-xs text-primary">
            Welcome back — this number already has an account. Verify your identity below to join.
          </p>
        )}
      </div>

      {accountExists !== true && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" placeholder="e.g. Kofi Mensah" required />
        </div>
      )}

      {(authStrategy === "PASSWORD_ONLY" || authStrategy === "PASSWORD_AND_OTP") && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={accountExists === true ? "current-password" : "new-password"}
            minLength={8}
            required
          />
          {accountExists !== true && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
        </div>
      )}

      {(authStrategy === "OTP_ONLY" || authStrategy === "PASSWORD_AND_OTP") && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="otpCode">SMS Verification Code</Label>
          <Input
            id="otpCode"
            name="otpCode"
            placeholder="e.g. 123456"
            required
          />
          <p className="text-xs text-muted-foreground">
            For local testing, enter the mock code <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">123456</code>.
          </p>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="mt-1 w-full">
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Joining…
          </>
        ) : (
          <>
            <LogIn aria-hidden />
            {accountExists === true ? "Join with this account" : "Join organisation"}
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
