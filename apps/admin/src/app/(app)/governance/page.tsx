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
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { GovernanceBody } from "@welfare/shared-types";
import { NewBodyDialog } from "./new-body-dialog";

export const metadata: Metadata = {
  title: "Governance — Welfare Platform",
};

export default async function GovernancePage() {
  const { token } = await requireSession();
  const bodies = await apiFetchOrNull<GovernanceBody[]>("/governance-bodies", { token, cache: "no-store" });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Governance bodies and their currently appointed officers.
          </p>
        </div>
        <NewBodyDialog />
      </div>

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
        <div className="overflow-hidden rounded-xl border border-border/60 shadow-md">
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
                    <Link href={`/governance/${body.id}`} className="flex items-center gap-1.5 font-medium hover:underline">
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
    </div>
  );
}
