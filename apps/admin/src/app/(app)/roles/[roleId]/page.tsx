import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound, Users } from "lucide-react";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Chapter, Member, Role, RoleAssignment } from "@welfare/shared-types";
import { revokeAssignmentAction } from "../actions";
import { AssignRoleDialog } from "./assign-role-dialog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ roleId: string }>;
}): Promise<Metadata> {
  const { roleId } = await params;
  return { title: `Role ${roleId.slice(0, 8)} — Welfare Platform` };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  const { token } = await requireSession();

  const roles = (await apiFetchOrNull<Role[]>("/roles", { token, cache: "no-store" })) ?? [];
  const role = roles.find((r) => r.id === roleId);
  if (!role) notFound();

  const [assignments, members, chapters] = await Promise.all([
    apiFetchOrNull<RoleAssignment[]>(`/roles/${roleId}/assignments`, { token, cache: "no-store" }),
    apiFetchOrNull<Member[]>("/members", { token, cache: "no-store" }),
    apiFetchOrNull<Chapter[]>("/chapters", { token, cache: "no-store" }),
  ]);

  // Server Component rendered fresh per request (cache: "no-store" above) —
  // "is this assignment still active" is meant to reflect request time,
  // not a memoized render-time snapshot.
  // eslint-disable-next-line react-hooks/purity -- intentional request-time read, not client re-render state
  const now = Date.now();
  const activeAssignments = (assignments ?? []).filter(
    (a) => !a.termEnd || new Date(a.termEnd).getTime() > now,
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/roles" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to roles &amp; access
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{role.name}</h1>
            <Badge variant="outline" className={role.isTemplate ? "" : "border-primary/30 bg-primary/10 text-primary"}>
              {role.isTemplate ? "Starter template" : "Custom"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeAssignments.length} current holder{activeAssignments.length === 1 ? "" : "s"}
          </p>
        </div>
        {members && <AssignRoleDialog roleId={role.id} roleName={role.name} members={members} chapters={chapters ?? []} />}
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" aria-hidden />
            Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-2">
            {role.permissions.map((permission, i) => (
              <li
                key={i}
                className="rounded-full border border-border/60 bg-muted px-3 py-1 font-mono text-xs text-muted-foreground"
              >
                {permission.resource}:{permission.action}
                <span className="ml-1.5 text-primary">[{permission.scope}]</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" aria-hidden />
            Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!assignments ? (
            <p className="py-6 text-center text-sm text-muted-foreground">You don&apos;t have access to view assignments.</p>
          ) : assignments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nobody holds this role yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {assignments.map((assignment) => {
                const expired = assignment.termEnd && new Date(assignment.termEnd).getTime() <= now;
                return (
                  <li key={assignment.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-mono text-sm">{assignment.member?.account.phoneNumber ?? assignment.memberId}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.chapter ? `${assignment.chapter.name} · ` : "Organisation-wide · "}
                        Since {formatDate(assignment.termStart)}
                        {assignment.termEnd && ` · ${expired ? "Ended" : "Ends"} ${formatDate(assignment.termEnd)}`}
                      </p>
                    </div>
                    {!expired && (
                      <AsyncActionButton
                        label="Revoke"
                        variant="destructive"
                        action={revokeAssignmentAction.bind(null, assignment.id, role.id)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
