"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { PERMISSION_SCOPES, type Permission } from "@welfare/shared-types";
import { createRoleAction, type FormActionState } from "./actions";

const INITIAL_STATE: FormActionState = { error: null };
const EMPTY_ROW: Permission = { resource: "", action: "", scope: "organisation" };

// A custom role is a free-form (resource, action, scope) list — §13.1's
// permission shape is deliberately open-ended, not a fixed catalog, so
// this is a plain builder rather than a checklist against a known set.
export function NewRoleDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Permission[]>([{ ...EMPTY_ROW }]);
  const [state, formAction, isPending] = useActionState(createRoleAction, INITIAL_STATE);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success) {
      setOpen(false);
      setRows([{ ...EMPTY_ROW }]);
    }
  }

  function updateRow(index: number, patch: Partial<Permission>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          New role
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            A role is a named set of (resource, action, scope) permissions — assign it to any member afterward.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input id="role-name" name="name" placeholder="e.g. Assistant Treasurer" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Permissions</Label>
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label="Resource"
                  placeholder="resource (e.g. ledger)"
                  value={row.resource}
                  onChange={(e) => updateRow(index, { resource: e.target.value })}
                  className="flex-1"
                />
                <Input
                  aria-label="Action"
                  placeholder="action (e.g. view)"
                  value={row.action}
                  onChange={(e) => updateRow(index, { action: e.target.value })}
                  className="flex-1"
                />
                <Select value={row.scope} onValueChange={(value) => updateRow(index, { scope: value as Permission["scope"] })}>
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERMISSION_SCOPES.map((scope) => (
                      <SelectItem key={scope} value={scope}>
                        {scope}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={rows.length === 1}
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="text-muted-foreground" aria-hidden />
                  <span className="sr-only">Remove permission</span>
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
            >
              <Plus aria-hidden />
              Add permission
            </Button>
          </div>

          <input type="hidden" name="permissionsJson" value={JSON.stringify(rows.filter((r) => r.resource && r.action))} />

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
                  Creating…
                </>
              ) : (
                "Create role"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
