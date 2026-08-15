import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, Users } from "lucide-react";
import { FilterChip } from "@/components/ui/filter-chip";
import { BulkImportMembersDialog } from "@/components/members/bulk-import-members-dialog";
import { MembersTable } from "@/components/members/members-table";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
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
      <DashboardHeader
        title="Members"
        subtitle={members ? `${activeRosterCount} member${activeRosterCount === 1 ? "" : "s"} on the active roster.` : "The member directory."}
        icon={Users}
        theme="blue"
        rightAction={
          <div className="flex items-center gap-2 justify-end">
            {pendingRemovals && pendingRemovals.length > 0 && (
              <Link
                href="/members/removal-requests"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20 transition-all duration-300"
              >
                <ShieldAlert className="size-4" aria-hidden />
                {pendingRemovals.length} pending removal{pendingRemovals.length === 1 ? "" : "s"}
              </Link>
            )}
            <BulkImportMembersDialog />
          </div>
        }
      />

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
        <MembersTable members={filtered} />
      )}
    </div>
  );
}
