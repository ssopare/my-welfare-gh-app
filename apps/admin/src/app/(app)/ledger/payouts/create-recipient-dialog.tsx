"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRecipientAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

const GH_PROVIDERS = [
  { code: "MTN", name: "MTN Mobile Money" },
  { code: "VOD", name: "Telecel (Vodafone Cash)" },
  { code: "ATL", name: "AT Money (AirtelTigo)" },
  { code: "GCB", name: "GCB Bank" },
  { code: "ECO", name: "Ecobank Ghana" },
  { code: "STA", name: "Stanbic Bank" },
  { code: "ABS", name: "Absa Bank Ghana" },
];

export function CreateRecipientDialog({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createRecipientAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Plus className="mr-1.5 size-4" />
          Add Recipient
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Allowlisted Recipient</DialogTitle>
          <DialogDescription>
            Register a verified recipient. Disbursements can only be sent to allowlisted accounts to prevent unauthorized fund outflows.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Full Name / Legal Name</Label>
            <Input id="name" name="name" placeholder="e.g. Kofi Mensah" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Account Type</Label>
            <select
              id="type"
              name="type"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background"
              required
            >
              <option value="momo">Mobile Money (MOMO)</option>
              <option value="bank">Bank Account</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankCode">Provider Bank / Network</Label>
            <select
              id="bankCode"
              name="bankCode"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background"
              required
            >
              {GH_PROVIDERS.map((provider) => (
                <option key={provider.code} value={provider.code}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountNumber">Phone Number / Account Number</Label>
            <Input
              id="accountNumber"
              name="accountNumber"
              placeholder="e.g. 0559998887"
              required
            />
          </div>

          {state.error && (
            <p role="alert" className="rounded-md bg-status-bad-bg px-3 py-2 text-sm text-status-bad">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin mr-1.5 size-4" />
                  Adding…
                </>
              ) : (
                "Add Recipient"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
