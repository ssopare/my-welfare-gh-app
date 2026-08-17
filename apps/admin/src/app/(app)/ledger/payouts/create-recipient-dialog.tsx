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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRecipientAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };

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
            Registers a real Paystack Transfer Recipient — Paystack has to accept the MoMo number before a
            disbursement can ever be sent to it. Disbursements can only target allowlisted, verified accounts.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Full Name / Legal Name</Label>
            <Input id="name" name="name" placeholder="e.g. Kofi Mensah" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="momoProvider">Mobile Money Network</Label>
            <Select name="momoProvider" defaultValue="mtn">
              <SelectTrigger id="momoProvider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                <SelectItem value="vod">Telecel Cash (Vodafone)</SelectItem>
                <SelectItem value="atl">AirtelTigo Money</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountNumber">MoMo Number</Label>
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
