import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ShieldAlert, Users } from "lucide-react";
import { MemberAvatar } from "@/components/members/member-avatar";
import { StatusBadge } from "@/components/finance/status-badge";
import { FilterChip } from "@/components/ui/filter-chip";
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
import { MEMBER_STATUS_META } from "@/lib/status-meta";
import {
  MEMBER_STATUSES,
  type Member,
  type MemberRemovalRequest,
  type MemberStatus,
} from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Members — Welfare Platform",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { token } = await requireSession();
  const { status } = await searchParams;
  const activeStatus = status && (MEMBER_STATUSES as readonly string[]).includes(status)
    ? (status as MemberStatus)
    : undefined;
  // Explicit escape hatch to see literally everyone, removed members
  // included — the default view (below) unlists them instead, same
  // "soft delete, not gone" reasoning as the member-detail reinstate action.
  const showAll = status === "ALL";

  const [members, pendingRemovals] = await Promise.all([
    apiFetchOrNull<Member[]>("/members", { token, cache: "no-store" }),
    apiFetchOrNull<MemberRemovalRequest[]>("/members/removal-requests?status=PENDING", {
      token,
      cache: "no-store",
    }),
  ]);

  const activeRosterCount = members?.filter((m) => m.status !== "EXITED").length ?? 0;
  const filtered = !members
    ? null
    : activeStatus
      ? members.filter((m) => m.status === activeStatus)
      : showAll
        ? members
        : members.filter((m) => m.status !== "EXITED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {members ? `${activeRosterCount} member${activeRosterCount === 1 ? "" : "s"} on the active roster.` : "The member directory."}
          </p>
        </div>
        {pendingRemovals && pendingRemovals.length > 0 && (
          <Link
            href="/members/removal-requests"
            className="inline-flex items-center gap-1.5 rounded-full border border-status-warn-border bg-status-warn-bg px-3 py-1.5 text-sm font-medium text-status-warn"
          >
            <ShieldAlert className="size-4" aria-hidden />
            {pendingRemovals.length} pending removal{pendingRemovals.length === 1 ? "" : "s"}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        <FilterChip href="/members" active={!activeStatus && !showAll}>
          Active roster ({activeRosterCount})
        </FilterChip>
        <FilterChip href="/members?status=ALL" active={showAll}>
          All{members ? ` (${members.length})` : ""}
        </FilterChip>
        {MEMBER_STATUSES.map((s) => {
          const count = members?.filter((m) => m.status === s).length ?? 0;
          if (count === 0 && s !== activeStatus) return null;
          return (
            <FilterChip key={s} href={`/members?status=${s}`} active={activeStatus === s}>
              {MEMBER_STATUS_META[s].label} ({count})
            </FilterChip>
          );
        })}
      </div>

      {!filtered ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Users className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">You don&apos;t have access to the member directory.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Users className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No members match this filter.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Chapter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => (
                <TableRow key={member.id} className="group transition-colors duration-150 hover:bg-primary/5">
                  <TableCell>
                    <Link href={`/members/${member.id}`} className="flex items-center gap-3">
                      <MemberAvatar name={member.account.name} phoneNumber={member.account.phoneNumber} size="sm" />
                      <span className="flex flex-col">
                        {member.account.name && <span className="text-sm font-medium">{member.account.name}</span>}
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {member.account.phoneNumber}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm capitalize text-muted-foreground">{member.category}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{member.chapter?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge {...MEMBER_STATUS_META[member.status]} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(member.joinDate)}</TableCell>
                  <TableCell>
                    <Link href={`/members/${member.id}`}>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
