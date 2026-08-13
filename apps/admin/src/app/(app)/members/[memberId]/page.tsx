import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, Calendar, Layers, RefreshCw, Users } from "lucide-react";
import { MemberAvatar } from "@/components/members/member-avatar";
import { StatementTab } from "@/components/members/statement-tab";
import { StatusBadge } from "@/components/finance/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiFetch, apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { MEMBER_STATUS_META } from "@/lib/status-meta";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import type {
  MemberDetail,
  MemberRemovalRequest,
  MemberStatement,
  Organisation,
} from "@welfare/shared-types";
import { ChangeStatusDialog } from "./change-status-dialog";
import { reinstateMemberAction } from "./actions";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ memberId: string }>;
}): Promise<Metadata> {
  const { memberId } = await params;
  return { title: `Member ${memberId.slice(0, 8)} — Welfare Platform` };
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const { token } = await requireSession();

  let member: MemberDetail;
  try {
    member = await apiFetch<MemberDetail>(`/members/${memberId}`, {
      token,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const [statement, organisation, pendingRemovals] = await Promise.all([
    apiFetchOrNull<MemberStatement>(`/members/${memberId}/statement`, { token, cache: "no-store" }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<MemberRemovalRequest[]>("/members/removal-requests?status=PENDING", {
      token,
      cache: "no-store",
    }),
  ]);
  const pendingRemoval = pendingRemovals?.find((r) => r.memberId === memberId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/members"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to members
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <MemberAvatar name={member.account.name} phoneNumber={member.account.phoneNumber} size="lg" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {member.account.name ?? member.account.phoneNumber}
            </h1>
            {member.account.name && (
              <p className="font-mono text-sm tabular-nums text-muted-foreground">
                {member.account.phoneNumber}
              </p>
            )}
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge {...MEMBER_STATUS_META[member.status]} />
              <span className="text-sm capitalize text-muted-foreground">{member.category} member</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {member.status === "EXITED" && (
            <AsyncActionButton
              action={reinstateMemberAction.bind(null, member.id)}
              label="Reinstate"
            />
          )}
          <ChangeStatusDialog memberId={member.id} currentStatus={member.status} />
        </div>
      </div>

      {pendingRemoval && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-warn-border bg-status-warn-bg px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-status-warn">
            <RefreshCw className="size-4 shrink-0" aria-hidden />
            <span>
              A removal was requested by {pendingRemoval.requestedByPhoneNumber ?? "another admin"}{" "}
              and is awaiting a different admin&apos;s confirmation.
            </span>
          </div>
          <Link
            href="/members/removal-requests"
            className="shrink-0 text-sm font-medium text-status-warn underline underline-offset-2"
          >
            Review request
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Calendar className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Joined</p>
              <p className="text-sm font-medium">{formatDate(member.joinDate)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Layers className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Chapter</p>
              <p className="text-sm font-medium">{member.chapter?.name ?? "Unassigned"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Users className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Dependants</p>
              <p className="text-sm font-medium">{member.dependants.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="statement">
        <TabsList className="print:hidden">
          <TabsTrigger value="statement">Statement</TabsTrigger>
          <TabsTrigger value="dependants">Dependants</TabsTrigger>
          <TabsTrigger value="history">Status history</TabsTrigger>
        </TabsList>

        <TabsContent value="statement" className="mt-4">
          {statement ? (
            <StatementTab statement={statement} currency={organisation?.currency ?? "GHS"} />
          ) : (
            <Card className="border-border/50 shadow-md">
              <CardContent>
                <p className="py-6 text-center text-sm text-muted-foreground">
                  You don&apos;t have access to this member&apos;s statement.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dependants" className="mt-4">
          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Registered dependants</CardTitle>
            </CardHeader>
            <CardContent>
              {member.dependants.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No dependants registered for this member yet.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {member.dependants.map((dependant) => (
                    <li key={dependant.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium">{dependant.name}</p>
                        <p className="text-xs capitalize text-muted-foreground">{dependant.relationship}</p>
                      </div>
                      {dependant.confirmed ? (
                        <span className="inline-flex items-center gap-1 text-xs text-status-good">
                          <BadgeCheck className="size-3.5" aria-hidden />
                          Confirmed
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Awaiting confirmation</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Status history</CardTitle>
            </CardHeader>
            <CardContent>
              {member.statusChanges.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No status changes recorded yet.</p>
              ) : (
                <ol className="flex flex-col gap-4 border-l border-border pl-4">
                  {member.statusChanges.map((change) => (
                    <li key={change.id} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-background" />
                      <div className="flex flex-wrap items-center gap-2">
                        {change.fromStatus && (
                          <>
                            <StatusBadge {...MEMBER_STATUS_META[change.fromStatus]} />
                            <span className="text-xs text-muted-foreground">→</span>
                          </>
                        )}
                        <StatusBadge {...MEMBER_STATUS_META[change.toStatus]} />
                      </div>
                      {change.reason && <p className="mt-1 text-sm text-muted-foreground">{change.reason}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(change.changedAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
