import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ScrollText, Users } from "lucide-react";
import { StatusBadge } from "@/components/finance/status-badge";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { GovernanceBody, GovernanceOfficer, Member, Role } from "@welfare/shared-types";
import { revokeOfficerAction } from "../actions";
import { AppointOfficerDialog } from "./appoint-officer-dialog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bodyId: string }>;
}): Promise<Metadata> {
  const { bodyId } = await params;
  return { title: `Governance ${bodyId.slice(0, 8)} — Welfare Platform` };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function GovernanceBodyDetailPage({
  params,
}: {
  params: Promise<{ bodyId: string }>;
}) {
  const { bodyId } = await params;
  const { token } = await requireSession();

  const bodies = (await apiFetchOrNull<GovernanceBody[]>("/governance-bodies", { token, cache: "no-store" })) ?? [];
  const body = bodies.find((b) => b.id === bodyId);
  if (!body) notFound();

  const [officers, members, roles] = await Promise.all([
    apiFetchOrNull<GovernanceOfficer[]>(`/governance-bodies/${bodyId}/officers`, { token, cache: "no-store" }),
    apiFetchOrNull<Member[]>("/members", { token, cache: "no-store" }),
    apiFetchOrNull<Role[]>("/roles", { token, cache: "no-store" }),
  ]);

  // eslint-disable-next-line react-hooks/purity -- intentional request-time read, not client re-render state
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/governance" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to governance
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{body.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {body.meetingCadence ? `Meets ${body.meetingCadence.toLowerCase()}` : "No meeting cadence set"}
          </p>
        </div>
        {members && roles && <AppointOfficerDialog bodyId={body.id} members={members} roles={roles} />}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <ScrollText className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Quorum rule</p>
              <p className="text-sm font-medium">{body.quorumRule ?? "Not configured"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Users className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Term limit</p>
              <p className="text-sm font-medium">
                {body.maxConsecutiveTerms
                  ? `${body.maxConsecutiveTerms} consecutive term${body.maxConsecutiveTerms === 1 ? "" : "s"}`
                  : "No limit"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Officers</CardTitle>
        </CardHeader>
        <CardContent>
          {!officers ? (
            <p className="py-6 text-center text-sm text-muted-foreground">You don&apos;t have access to view officers.</p>
          ) : officers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No officers have ever been appointed to this body.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {officers.map((officer) => {
                const expired = officer.termEnd && new Date(officer.termEnd).getTime() <= now;
                return (
                  <li key={officer.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{officer.role.name}</p>
                        <StatusBadge tone={expired ? "neutral" : "good"} label={expired ? "Term ended" : "Serving"} />
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{officer.member.account.phoneNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        Since {formatDate(officer.termStart)}
                        {officer.termEnd && ` · ${expired ? "Ended" : "Ends"} ${formatDate(officer.termEnd)}`}
                      </p>
                    </div>
                    {!expired && (
                      <AsyncActionButton
                        label="Revoke"
                        variant="destructive"
                        action={revokeOfficerAction.bind(null, officer.id, body.id)}
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
