import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, ArrowLeft, CheckCircle, XCircle, Clock } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type {
  Fund,
  Organisation,
  SettlementAccount,
  FundControlPolicy,
  PayoutRecipient,
  PayoutRequest,
  Member,
} from "@welfare/shared-types";
import { CreateRecipientDialog } from "./create-recipient-dialog";
import { RequestPayoutDialog } from "./request-payout-dialog";
import { ApprovePayoutDialog } from "./approve-payout-dialog";
import { SettlementForm } from "./settlement-form";
import { PolicyForm } from "./policy-form";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export const metadata: Metadata = {
  title: "Treasury & Payouts — Welfare Platform",
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

export default async function TreasuryPage() {
  const { token, identity } = await requireSession();

  const [organisation, funds, settlement, policy, recipients, requests, members] = await Promise.all([
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" }),
    apiFetchOrNull<SettlementAccount>("/payouts/settlement-account", { token, cache: "no-store" }),
    apiFetchOrNull<FundControlPolicy>("/payouts/policy", { token, cache: "no-store" }),
    apiFetchOrNull<PayoutRecipient[]>("/payouts/recipients", { token, cache: "no-store" }),
    apiFetchOrNull<PayoutRequest[]>("/payouts/requests", { token, cache: "no-store" }),
    apiFetchOrNull<Member[]>("/members", { token, cache: "no-store" }),
  ]);

  const currency = organisation?.currency ?? "GHS";
  const memberMap = new Map(members?.map((m) => [m.id, m.account.name]));

  // Calculate required approvals for a request based on policy thresholds
  function getApprovalsRequirement(amount: string): { required: number; label: string } {
    if (!policy) return { required: 1, label: "1 checker" };
    const amt = Number.parseFloat(amount);
    const t1 = Number.parseFloat(policy.thresholdOneApproverValue);
    const t2 = Number.parseFloat(policy.thresholdTwoApproversValue);

    if (amt <= t1) {
      return { required: 1, label: "1 checker" };
    } else if (amt <= t2) {
      return { required: 2, label: "2 checkers" };
    } else {
      return { required: 3, label: "3 checkers (Committee)" };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
          <Link href="/ledger">
            <ArrowLeft className="size-4" />
            Back to Ledger
          </Link>
        </Button>
      </div>

      <DashboardHeader
        title="Treasury"
        highlightedText="&amp; Payouts"
        subtitle="Configure dynamic payment settlements, allowlisted recipients, control policies, and approve payout requests."
        icon={Landmark}
        badgeText="Treasury Operations"
        rightAction={
          <div className="flex items-center gap-2">
            {organisation && funds && recipients && (
              <RequestPayoutDialog
                recipients={recipients}
                funds={funds}
                organisation={organisation}
                className="h-9 px-4 rounded-xl shadow-md transition-all font-semibold"
              />
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Side: Settlement and Policies */}
        <div className="flex flex-col gap-6">
          {/* Settlement Account Card */}
          <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md dark:bg-glass-card/45">
            <CardHeader suppressHydrationWarning>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="size-4 text-primary" />
                Settlement Account Setup
              </CardTitle>
              <CardDescription suppressHydrationWarning>
                Link your Paystack subaccount or verified bank/MoMo details for direct payouts settlement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SettlementForm settlement={settlement} />
            </CardContent>
          </Card>

          {/* Control Policy Card */}
          <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md dark:bg-glass-card/45">
            <CardHeader suppressHydrationWarning>
              <CardTitle className="text-base">Fund Control Policy &amp; Limits</CardTitle>
              <CardDescription suppressHydrationWarning>
                Set strict payout restrictions, daily caps, and dynamic approver counts for decentralized treasury control.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PolicyForm policy={policy} currency={currency} />
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Allowlisted Recipients */}
        <div className="flex flex-col gap-6">
          <Card className="h-full border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md dark:bg-glass-card/45">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <CardTitle className="text-base">Allowlisted Recipients</CardTitle>
                <CardDescription>Verified beneficiaries allowed to receive fund transfers.</CardDescription>
              </div>
              <CreateRecipientDialog />
            </CardHeader>
            <CardContent>
              {!recipients || recipients.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No allowlisted recipients set up yet. Add recipients to enable disbursements.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Beneficiary</TableHead>
                        <TableHead>Network / Bank</TableHead>
                        <TableHead>Account Number</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipients.map((recipient) => (
                        <TableRow key={recipient.id} className="hover:bg-primary/5">
                          <TableCell className="font-semibold text-sm">{recipient.name}</TableCell>
                          <TableCell className="text-xs uppercase text-muted-foreground">{recipient.bankCode}</TableCell>
                          <TableCell className="font-mono text-sm">{recipient.accountNumber}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payout Queue */}
      <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md dark:bg-glass-card/45">
        <CardHeader>
          <CardTitle className="text-base">Treasury Disbursements &amp; Approvals Queue</CardTitle>
          <CardDescription>
            Audit trail of payout requests, check counts, approvals, and dynamic ledger entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!requests || requests.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No payout requests submitted yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Submitted</TableHead>
                    <TableHead>Beneficiary</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approvals Status</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead className="w-44 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => {
                    const approvalsReq = getApprovalsRequirement(request.amountValue);
                    const approvalsGiven = request.approvals?.filter((a) => a.decision === "APPROVED").length ?? 0;
                    const isMaker = request.requesterId === identity.memberId;
                    const canApprove =
                      request.status === "PENDING" &&
                      !isMaker &&
                      !request.approvals?.some((a) => a.officerId === identity.memberId);

                    return (
                      <TableRow key={request.id} className="hover:bg-primary/5">
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(request.createdAt)}
                          <div className="text-[10px] text-muted-foreground/75">
                            By {memberMap.get(request.requesterId) ?? "Unknown"}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-sm">
                          {request.recipient?.name ?? "Unknown Recipient"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {funds?.find((f) => f.id === request.fundId)?.name ?? "Welfare"}
                        </TableCell>
                        <TableCell>
                          <MoneyDisplay value={request.amountValue} currency={currency} size="sm" />
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              request.status === "SUCCEEDED"
                                ? "bg-status-good-bg text-status-good border border-status-good-border"
                                : request.status === "FAILED" || request.status === "REJECTED"
                                ? "bg-status-bad-bg text-status-bad border border-status-bad-border"
                                : "bg-status-warn-bg/20 text-status-warn border border-status-warn-border/30"
                            }`}
                          >
                            {request.status === "SUCCEEDED" && <CheckCircle className="size-3" />}
                            {request.status === "FAILED" && <XCircle className="size-3" />}
                            {request.status === "PENDING" && <Clock className="size-3" />}
                            {request.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-semibold">
                            {approvalsGiven} / {approvalsReq.required} approvals
                          </div>
                          <div className="text-muted-foreground/75">({approvalsReq.label} needed)</div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs">{request.purpose}</TableCell>
                        <TableCell className="text-right">
                          {canApprove ? (
                            <ApprovePayoutDialog
                              requestId={request.id}
                              amountValue={request.amountValue}
                              currency={currency}
                              purpose={request.purpose}
                            />
                          ) : request.status === "PENDING" ? (
                            <span className="text-xs text-muted-foreground italic">
                              {isMaker ? "Maker restrictions apply" : "Already evaluated"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
