"use client";

import { useActionState, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
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
import type { Chapter, Member } from "@welfare/shared-types";
import { assignRoleAction, type FormActionState } from "../actions";

const INITIAL_STATE: FormActionState = { error: null };
const NONE = "__none__";

export function AssignRoleDialog({
  roleId,
  roleName,
  members,
  chapters,
}: {
  roleId: string;
  roleName: string;
  members: Member[];
  chapters: Chapter[];
}) {
  const [open, setOpen] = useState(false);
  const boundAction = assignRoleAction.bind(null, roleId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus aria-hidden />
          Assign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {roleName}</DialogTitle>
          <DialogDescription>Takes effect immediately — no new sign-in needed.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="memberId">Member</Label>
            <Select name="memberId">
              <SelectTrigger id="memberId" className="w-full">
                <SelectValue placeholder="Choose a member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.account.phoneNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {chapters.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chapterId">Chapter scope (optional)</Label>
              <Select name="chapterId" defaultValue={NONE}>
                <SelectTrigger id="chapterId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Organisation-wide</SelectItem>
                  {chapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="termEnd">Ends on (optional)</Label>
            <Input id="termEnd" name="termEnd" type="date" />
            <p className="text-xs text-muted-foreground">Leave blank for a standing assignment.</p>
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
                  <Loader2 className="animate-spin" aria-hidden />
                  Assigning…
                </>
              ) : (
                "Assign role"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
