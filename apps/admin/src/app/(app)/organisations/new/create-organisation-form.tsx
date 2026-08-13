"use client";

import { useActionState } from "react";
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
import { createAdditionalOrganisationAction, type CreateOrganisationFormState } from "./actions";

const INITIAL_STATE: CreateOrganisationFormState = { error: null };

export function CreateOrganisationForm() {
  const [state, formAction, isPending] = useActionState(createAdditionalOrganisationAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="legalName">Organisation name</Label>
        <Input
          id="legalName"
          name="legalName"
          autoComplete="organization"
          placeholder="e.g. Kumasi Traders Welfare Group"
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

      {state.error && (
        <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
          {state.error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        After creating it, you&apos;ll be switched into this new organisation&apos;s context. Use the
        organisation switcher in the sidebar to move between organisations any time.
      </p>

      <Button type="submit" disabled={isPending} className="mt-1 w-fit">
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Creating…
          </>
        ) : (
          <>
            <Sparkles aria-hidden />
            Create organisation
          </>
        )}
      </Button>
    </form>
  );
}
