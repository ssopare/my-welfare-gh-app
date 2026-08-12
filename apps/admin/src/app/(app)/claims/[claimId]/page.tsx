import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, FileCheck } from "lucide-react";
import { ClaimTimeline } from "@/components/claims/claim-timeline";
import { MemberAvatar } from "@/components/members/member-avatar";
import { MoneyDisplay } from "@/components/finance/money-display";
import { StatusBadge } from "@/components/finance/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiFetch, apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { CLAIM_STATUS_META } from "@/lib/status-meta";
import type { Claim, Fund } from "@welfare/shared-types";
import { DecideClaimDialog } from "./decide-claim-dialog";
import { DisburseClaimDialog } from "./disburse-claim-dialog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ claimId: string }>;
}): Promise<Metadata> {
  const { claimId } = await params;
  return { title: `Claim ${claimId.slice(0, 8)} — Welfare Platform` };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const { token } = await requireSession();

  let claim: Claim;
  try {
    claim = await apiFetch<Claim>(`/claims/${claimId}`, { token, cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const funds = claim.status === "APPROVED" ? await apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" }) : null;
  const stageName = claim.benefitRule?.approvalChain?.[claim.currentStageIndex] ?? "default";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/claims" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to claims
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {claim.member && (
            <MemberAvatar name={claim.member.account.name} phoneNumber={claim.member.account.phoneNumber} size="lg" />
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{claim.benefitRule?.name ?? "Claim"}</h1>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge {...CLAIM_STATUS_META[claim.status]} />
              {claim.member && (
                <span className="text-sm text-muted-foreground">
                  {claim.member.account.name ?? claim.member.account.phoneNumber}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {claim.status === "SUBMITTED" && (
            <>
              <DecideClaimDialog claimId={claim.id} decision="REJECT" stageName={stageName} />
              <DecideClaimDialog claimId={claim.id} decision="APPROVE" stageName={stageName} />
            </>
          )}
          {claim.status === "APPROVED" && funds && (
            <DisburseClaimDialog claimId={claim.id} amount={claim.amountValue} currency={claim.currency} funds={funds} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Calendar className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Event date</p>
              <p className="text-sm font-medium">{formatDate(claim.eventDate)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <FileCheck className="size-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount</p>
              <MoneyDisplay value={claim.amountValue} currency={claim.currency} size="sm" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Approval timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ClaimTimeline claim={claim} />
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Evidence</CardTitle>
        </CardHeader>
        <CardContent>
          {claim.evidence.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No evidence submitted with this claim.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {claim.evidence.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium capitalize">{item.evidenceType.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
