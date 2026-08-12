import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { AsyncActionButton } from "@/components/ui/async-action-button";
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
import type { MemberRemovalRequest } from "@welfare/shared-types";
import { cancelRemovalAction } from "./actions";
import { ConfirmRemovalDialog } from "./confirm-removal-dialog";

export const metadata: Metadata = {
  title: "Pending removals — Welfare Platform",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_BADGE_VARIANT: Record<MemberRemovalRequest["status"], "outline" | "default" | "secondary"> = {
  PENDING: "outline",
  CONFIRMED: "secondary",
  CANCELLED: "secondary",
};

export default async function RemovalRequestsPage() {
  const { token, identity } = await requireSession();

  const requests = await apiFetchOrNull<MemberRemovalRequest[]>(
    "/members/removal-requests",
    { token, cache: "no-store" },
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/members"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to members
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pending removals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Removals proposed under maker-checker sit here until a different admin than the one who
          proposed it confirms — or either can cancel it instead.
        </p>
      </div>

      {!requests ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <ShieldAlert className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">You don&apos;t have access to this.</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <ShieldAlert className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No removal requests, pending or resolved.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 shadow-md">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-64" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => {
                const isOwnRequest = request.requestedBy === identity.memberId;
                return (
                  <TableRow key={request.id}>
                    <TableCell>
                      <Link
                        href={`/members/${request.memberId}`}
                        className="font-mono text-sm tabular-nums hover:underline"
                      >
                        {request.member.account.phoneNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">
                      {request.reason}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>{request.requestedByPhoneNumber ?? "—"}</div>
                      <div className="text-xs">{formatDateTime(request.requestedAt)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[request.status]} className="capitalize">
                        {request.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {request.status === "PENDING" && (
                        <div className="flex items-center justify-end gap-2">
                          {isOwnRequest ? (
                            <span className="text-xs text-muted-foreground">
                              You proposed this — a different admin must confirm
                            </span>
                          ) : (
                            <ConfirmRemovalDialog
                              requestId={request.id}
                              memberPhoneNumber={request.member.account.phoneNumber}
                              reason={request.reason}
                            />
                          )}
                          <AsyncActionButton
                            action={cancelRemovalAction.bind(null, request.id)}
                            label="Cancel"
                            variant="outline"
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
