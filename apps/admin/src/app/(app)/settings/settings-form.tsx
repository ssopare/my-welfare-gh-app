"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormActionState } from "./actions";

interface OrgSettingsFormProps {
  currentAuthStrategy: string;
  currentAllocationPolicy: string;
  action: (prevState: FormActionState, formData: FormData) => Promise<FormActionState>;
}

// OTP_ONLY/PASSWORD_AND_OTP are intentionally not offered — they were
// never wired to a real SMS provider, just a hardcoded universal code any
// account could be accessed with (see AuthService.effectiveAuthStrategy
// and UpdateOrganisationSettingsDto.authStrategy on the API side, which
// reject anything but PASSWORD_ONLY regardless of what this form sends).
const AUTH_STRATEGIES = [{ value: "PASSWORD_ONLY", label: "Password only" }];

const ALLOCATION_POLICIES = [
  { value: "oldest_first", label: "Oldest obligation first (default)" },
  { value: "member_selected", label: "Member selects which obligation to pay" },
];

export function OrgSettingsForm({ currentAuthStrategy, currentAllocationPolicy, action }: OrgSettingsFormProps) {
  const [state, formAction, isPending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="authStrategy" className="text-sm font-medium text-foreground">
          Member authentication method
        </label>
        <select
          id="authStrategy"
          name="authStrategy"
          defaultValue={currentAuthStrategy}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {AUTH_STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          How members verify their identity when signing in on the mobile app.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="paymentAllocationPolicy" className="text-sm font-medium text-foreground">
          Payment allocation policy
        </label>
        <select
          id="paymentAllocationPolicy"
          name="paymentAllocationPolicy"
          defaultValue={currentAllocationPolicy}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ALLOCATION_POLICIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Determines which outstanding obligation gets credited when a member makes a payment.
        </p>
      </div>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
          Settings saved successfully.
        </p>
      )}

      <Button type="submit" disabled={isPending} className="self-start gap-1.5">
        {isPending && <Loader2 className="size-3.5 animate-spin" />}
        Save Settings
      </Button>
    </form>
  );
}
