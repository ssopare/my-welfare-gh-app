import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Gavel } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
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
import { CLAIM_STATUS_META } from "@/lib/status-meta";
import { CLAIM_STATUSES, type BenefitRule, type Claim, type ClaimStatus, type Member } from "@welfare/shared-types";
import { NewClaimDialog } from "./new-claim-dialog";

export const metadata: Metadata = {
  title: "Claims — Welfare Platform",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { token } = await requireSession();
  const { status } = await searchParams;
  const activeStatus = status && (CLAIM_STATUSES as readonly string[]).includes(status) ? (status as ClaimStatus) : undefined;

  const [claims, activeRules, members] = await Promise.all([
    apiFetchOrNull<Claim[]>("/claims", { token, cache: "no-store" }),
    apiFetchOrNull<BenefitRule[]>("/benefit-rules", { token, cache: "no-store" }),
    apiFetchOrNull<Member[]>("/members", { token, cache: "no-store" }),
  ]);
  const filtered = activeStatus ? claims?.filter((c) => c.status === activeStatus) : claims;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Claims</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every claim is checked against the real eligibility rules before it can even be filed.
          </p>
        </div>
        {activeRules && members && <NewClaimDialog rules={activeRules} members={members} />}
      </div>

      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        <FilterChip href="/claims" active={!activeStatus}>
          All{claims ? ` (${claims.length})` : ""}
        </FilterChip>
        {CLAIM_STATUSES.map((s) => {
          const count = claims?.filter((c) => c.status === s).length ?? 0;
          if (count === 0 && s !== activeStatus) return null;
          return (
            <FilterChip key={s} href={`/claims?status=${s}`} active={activeStatus === s}>
              {CLAIM_STATUS_META[s].label} ({count})
            </FilterChip>
          );
        })}
      </div>

      {!filtered ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Gavel className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">You don&apos;t have access to claims.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Gavel className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No claims match this filter.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 shadow-md">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Benefit</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell>
                    <Link href={`/claims/${claim.id}`} className="font-mono text-sm hover:underline">
                      {claim.member?.account.phoneNumber ?? claim.memberId}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{claim.benefitRule?.name ?? "—"}</TableCell>
                  <TableCell>
                    <MoneyDisplay value={claim.amountValue} currency={claim.currency} size="sm" />
                  </TableCell>
                  <TableCell>
                    <StatusBadge {...CLAIM_STATUS_META[claim.status]} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(claim.createdAt)}</TableCell>
                  <TableCell>
                    <Link href={`/claims/${claim.id}`}>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
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
