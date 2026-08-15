import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, BarChart3, Calendar, Check, Info, ShieldAlert, Users, Vote, X } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { apiFetch, apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Election, Nomination, ElectionResultsResponse } from "@welfare/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VetNominationDialog } from "./vet-dialog";

export const metadata: Metadata = {
  title: "Election Details — Welfare Platform",
};

interface PageProps {
  params: Promise<{ electionId: string }>;
}

export default async function ElectionDetailPage({ params }: PageProps) {
  const { electionId } = await params;
  const { token } = await requireSession();

  // Fetch election details (includes nominations, nominees, and options)
  const election = await apiFetch<Election>(`/elections/${electionId}`, { token, cache: "no-store" });

  // Fetch results if active or completed
  let results: ElectionResultsResponse | null = null;
  if (election.status === "ACTIVE" || election.status === "COMPLETED") {
    results = await apiFetchOrNull<ElectionResultsResponse>(`/elections/${electionId}/results`, {
      token,
      cache: "no-store",
    });
  }

  // Fetch member accounts to display names properly for nominations
  // (We can load all members or fetch them inline, fetching a list is cleaner)
  interface MinimalMember {
    id: string;
    account: { name: string | null; phoneNumber: string };
  }
  const members = await apiFetchOrNull<MinimalMember[]>("/members", { token, cache: "no-store" }) ?? [];

  const getMemberName = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    return member?.account?.name ?? member?.account?.phoneNumber ?? "Unknown Member";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link href="/governance">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            Back to Governance
          </Button>
        </Link>
      </div>

      <DashboardHeader
        title={election.title}
        subtitle={election.description ?? "Election details, timeline, and voting metrics."}
        icon={Vote}
        theme="indigo"
      />

      {/* Grid containing Details and Results */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: General Configuration */}
        <div className="md:col-span-1 rounded-xl border border-glass-border bg-glass-card/35 backdrop-blur-md p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">General Setup</h3>
          
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Election Type</span>
            <span className="font-semibold text-foreground">
              {election.type === "OFFICER" ? "Officer Selection" : "Issue Referendum"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Ballot Privacy</span>
            <span className="font-semibold text-foreground">
              {election.isAnonymous ? "Anonymous / Private Ballot" : "Open / Public Ballot"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Quorum Threshold</span>
            <span className="font-semibold text-foreground">{Number(election.quorumPercentage)}%</span>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Pass Threshold</span>
            <span className="font-semibold text-foreground">{Number(election.passPercentage)}%</span>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Voting window</span>
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Calendar className="size-4 text-muted-foreground" />
              <span>
                {new Date(election.startsAt).toLocaleString()} - <br />
                {new Date(election.endsAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Turnout & Results (when Active/Completed) */}
        <div className="md:col-span-2 rounded-xl border border-glass-border bg-glass-card/35 backdrop-blur-md p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <BarChart3 className="size-4 text-indigo-500" />
            Live Turnout & Results
          </h3>

          {!results ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center h-full">
              <Info className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Results will be available once the election enters the **ACTIVE** voting phase.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Turnout metrics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-zinc-50/50 p-4 dark:bg-zinc-950/20">
                  <span className="text-xs text-muted-foreground">Total Cast</span>
                  <p className="text-xl font-bold mt-1 text-foreground">{results.totalVotesCast}</p>
                </div>
                <div className="rounded-lg bg-zinc-50/50 p-4 dark:bg-zinc-950/20">
                  <span className="text-xs text-muted-foreground">Turnout Rate</span>
                  <p className="text-xl font-bold mt-1 text-foreground">
                    {results.turnoutPercentage.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-50/50 p-4 dark:bg-zinc-950/20">
                  <span className="text-xs text-muted-foreground">Quorum Met?</span>
                  <div className="flex items-center gap-1 mt-1">
                    {results.quorumMet ? (
                      <BadgeCheck className="size-5 text-green-500" />
                    ) : (
                      <ShieldAlert className="size-5 text-amber-500" />
                    )}
                    <span className="font-semibold text-sm">
                      {results.quorumMet ? "PASSED" : "PENDING"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Vote Count list with styled progress bars */}
              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vote distribution</h4>
                {results.results.map((r) => {
                  const percent = results!.totalVotesCast > 0 ? (r.count / results!.totalVotesCast) * 100 : 0;
                  return (
                    <div key={r.optionId} className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-foreground">{r.label}</span>
                        <span className="text-muted-foreground font-semibold">{r.count} vote(s) ({percent.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                        <div className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nominations & Vetting Pipeline (Officer Elections only) */}
      {election.type === "OFFICER" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-foreground">Nomination & Vetting Board</h3>
          </div>

          {!election.nominations || election.nominations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <Users className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No nominations have been submitted yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-glass-border bg-glass-card/35 backdrop-blur-md shadow-lg dark:bg-glass-card/15">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nominee</TableHead>
                    <TableHead>Nominator</TableHead>
                    <TableHead>Manifesto Statement</TableHead>
                    <TableHead>Seconders</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {election.nominations.map((nom) => (
                    <TableRow key={nom.id}>
                      <TableCell className="font-medium text-foreground">
                        {getMemberName(nom.nomineeMemberId)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getMemberName(nom.nominatorId)}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate text-muted-foreground">
                        {nom.statement ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-foreground">
                        {nom.seconders.length} seconded
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            nom.status === "APPROVED"
                              ? "bg-green-50 text-green-700 border-none px-2 py-0.5"
                              : nom.status === "REJECTED"
                                ? "bg-red-50 text-red-700 border-none px-2 py-0.5"
                                : "bg-yellow-50 text-yellow-700 border-none px-2 py-0.5"
                          }
                        >
                          {nom.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {nom.status === "PENDING" && election.status === "VETTING" ? (
                          <VetNominationDialog nomination={nom} electionId={electionId} nomineeName={getMemberName(nom.nomineeMemberId)} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Vetted</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
