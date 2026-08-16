"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuthStrategy } from "@welfare/shared-types";
import { updateAuthStrategyAction } from "./actions";

// SMS OTP options are intentionally not offered here — they were never
// wired to a real SMS provider, just a hardcoded universal code any
// account could be accessed with. Re-add once real SMS delivery exists;
// see AuthService.effectiveAuthStrategy and
// UpdateOrganisationSettingsDto.authStrategy on the API side, which
// reject anything but PASSWORD_ONLY regardless of what this form sends.
const OPTIONS: { value: AuthStrategy; label: string; description: string }[] = [
  {
    value: "PASSWORD_ONLY",
    label: "Password Only",
    description: "Members sign in and join using their account phone number and password.",
  },
];

export function AuthStrategySetting({ strategy }: { strategy: AuthStrategy }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStrategy, setOptimisticStrategy] = useState(strategy);

  return (
    <div className="flex flex-col gap-1.5 mt-6">
      <Label htmlFor="authStrategy">Login Security Strategy</Label>
      <Select
        value={optimisticStrategy}
        disabled={isPending}
        onValueChange={(value) => {
          const next = value as AuthStrategy;
          setOptimisticStrategy(next);
          startTransition(async () => {
            try {
              await updateAuthStrategyAction(next);
              toast.success("Authentication strategy updated successfully.");
            } catch (error) {
              setOptimisticStrategy(strategy);
              toast.error(error instanceof Error ? error.message : "Something went wrong.");
            }
          });
        }}
      >
        <SelectTrigger id="authStrategy" className="w-full sm:w-80">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {OPTIONS.find((o) => o.value === optimisticStrategy)?.description}
      </p>
    </div>
  );
}
