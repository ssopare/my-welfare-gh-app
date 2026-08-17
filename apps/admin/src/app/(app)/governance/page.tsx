import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Landmark } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { GovernanceBody, Election, Organisation } from "@welfare/shared-types";
import { NewBodyDialog } from "./new-body-dialog";
import { NewElectionDialog } from "./new-election-dialog";
import { ElectionTab } from "./election-tab";

export const metadata: Metadata = {
  title: "Governance — Welfare Platform",
};

export default async function GovernancePage() {
  const { token } = await requireSession();
  const [bodies, organisation] = await Promise.all([
    apiFetchOrNull<GovernanceBody[]>("/governance-bodies", { token, cache: "no-store" }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
  ]);
  // Voting is an optional plan module (see ModuleAccessGuard on the API
  // side) — hidden entirely when not included, not shown disabled, so an
  // org without it never even sees a tab that would just 403.
  const hasVoting = organisation?.includedModules.includes("voting") ?? false;
  const elections = hasVoting
    ? await apiFetchOrNull<Election[]>("/elections", { token, cache: "no-store" })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Governance"
        subtitle="Governance bodies, officer appointments, and active elections / referendums."
        icon={Landmark}
        theme="indigo"
        rightAction={
          <div className="flex gap-2">
            <NewBodyDialog />
            {hasVoting && <NewElectionDialog />}
          </div>
        }
      />

      <Tabs defaultValue="bodies" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="bodies">Governance Bodies</TabsTrigger>
          {hasVoting && <TabsTrigger value="elections">Elections & Referendums</TabsTrigger>}
        </TabsList>

        <TabsContent value="bodies">
          {!bodies ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <Landmark className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">You don&apos;t have access to governance.</p>
            </div>
          ) : bodies.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <Landmark className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No governance bodies set up yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-glass-border bg-glass-card/35 backdrop-blur-md shadow-lg transition-all duration-300 hover:shadow-xl dark:bg-glass-card/15">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Meeting cadence</TableHead>
                    <TableHead>Term limit</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bodies.map((body) => (
                    <TableRow key={body.id}>
                      <TableCell>
                        <Link href={`/governance/${body.id}`} className="flex items-center gap-1.5 font-medium hover:underline text-foreground">
                          {body.name}
                          <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{body.meetingCadence ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {body.maxConsecutiveTerms
                          ? `${body.maxConsecutiveTerms} term${body.maxConsecutiveTerms === 1 ? "" : "s"}${body.coolingOffPeriodMonths ? `, ${body.coolingOffPeriodMonths}mo cool-off` : ""}`
                          : "No limit"}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {hasVoting && (
          <TabsContent value="elections">
            <ElectionTab elections={elections} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
