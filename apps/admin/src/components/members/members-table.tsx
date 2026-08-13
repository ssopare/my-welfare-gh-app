"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, CheckCheck, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/components/members/member-avatar";
import { StatusBadge } from "@/components/finance/status-badge";
import { MEMBER_STATUS_META } from "@/lib/status-meta";
import { bulkApproveMembersAction } from "@/app/(app)/members/actions";
import type { Member } from "@welfare/shared-types";

interface MembersTableProps {
  members: Member[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MembersTable({ members }: MembersTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const searchedMembers = members.filter((m) => {
    const name = m.account.name?.toLowerCase() || "";
    const phone = m.account.phoneNumber || "";
    const query = searchQuery.toLowerCase().trim();
    return name.includes(query) || phone.includes(query);
  });

  const pendingMembers = searchedMembers.filter((m) => m.status === "PENDING");
  const allPendingSelected = pendingMembers.length > 0 && selectedIds.size === pendingMembers.length;

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(pendingMembers.map((m) => m.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function toggleSelectRow(memberId: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(memberId);
    } else {
      next.delete(memberId);
    }
    setSelectedIds(next);
  }

  function handleBulkApprove() {
    if (selectedIds.size === 0) return;

    startTransition(async () => {
      try {
        const { successCount, errorCount } = await bulkApproveMembersAction(Array.from(selectedIds));
        if (successCount > 0) {
          toast.success(`Successfully approved ${successCount} member(s).`);
          setSelectedIds(new Set()); // Reset selections on success
        }
        if (errorCount > 0) {
          toast.error(`Failed to approve ${errorCount} member(s).`);
        }
      } catch (err) {
        toast.error("Failed to complete bulk approval.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search Bar */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-4"
        />
      </div>

      {/* Selective Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-status-good-border bg-status-good-bg/10 p-3 animate-in fade-in slide-in-from-top-2 duration-250">
          <span className="text-sm font-medium text-foreground">
            Selected <strong>{selectedIds.size}</strong> pending member{selectedIds.size === 1 ? "" : "s"} for approval
          </span>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="gap-2 bg-status-good hover:bg-status-good/90 text-white font-medium shadow-sm"
            onClick={handleBulkApprove}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Approving...
              </>
            ) : (
              <>
                <CheckCheck className="size-4" />
                Approve Selected ({selectedIds.size})
              </>
            )}
          </Button>
        </div>
      )}

      {/* Roster Table */}
      <div className="overflow-hidden rounded-xl border border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {pendingMembers.length > 0 && (
                <TableHead className="w-12 px-4 text-center">
                  <Checkbox
                    checked={allPendingSelected}
                    onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                    aria-label="Select all pending members"
                  />
                </TableHead>
              )}
              <TableHead>Member</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Chapter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {searchedMembers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={pendingMembers.length > 0 ? 7 : 6}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  No members match your search criteria.
                </TableCell>
              </TableRow>
            ) : (
              searchedMembers.map((member) => {
                const isPendingRow = member.status === "PENDING";
                return (
                  <TableRow key={member.id} className="group transition-colors duration-150 hover:bg-primary/5">
                    {pendingMembers.length > 0 && (
                      <TableCell className="px-4 text-center">
                        {isPendingRow && (
                          <Checkbox
                            checked={selectedIds.has(member.id)}
                            onCheckedChange={(checked) => toggleSelectRow(member.id, checked === true)}
                            aria-label={`Select ${member.account.name || member.account.phoneNumber}`}
                          />
                        )}
                      </TableCell>
                    )}
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
