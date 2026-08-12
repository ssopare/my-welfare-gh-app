import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Role } from "@welfare/shared-types";
import { NewRoleDialog } from "./new-role-dialog";

export const metadata: Metadata = {
  title: "Roles & Access — Welfare Platform",
};

export default async function RolesPage() {
  const { token } = await requireSession();
  const roles = await apiFetchOrNull<Role[]>("/roles", { token, cache: "no-store" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles &amp; Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every permission check is live against these — revoking access takes effect immediately.
          </p>
        </div>
        <NewRoleDialog />
      </div>

      {!roles ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <ShieldCheck className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">You don&apos;t have access to role management.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 shadow-md">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <Link href={`/roles/${role.id}`} className="flex items-center gap-1.5 font-medium hover:underline">
                      {role.name}
                      <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={role.isTemplate ? "" : "border-primary/30 bg-primary/10 text-primary"}>
                      {role.isTemplate ? "Starter template" : "Custom"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
