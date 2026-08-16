"use client";

import Link from "next/link";
import { ChevronRight, Calendar, Vote, Users, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Election, ElectionStatus } from "@welfare/shared-types";
import { transitionElectionStatusAction } from "./actions";

interface ElectionTabProps {
  elections: Election[] | null;
}

export function ElectionTab({ elections }: ElectionTabProps) {
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  const handleStatusChange = async (electionId: string, status: ElectionStatus) => {
    setTransitioningId(electionId);
    try {
      await transitionElectionStatusAction(electionId, status);
    } catch (e) {
      console.error(e);
    } finally {
      setTransitioningId(null);
    }
  };

  const getStatusColor = (status: ElectionStatus) => {
    switch (status) {
      case "DRAFT":
        return "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";
      case "NOMINATION":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "VETTING":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "ACTIVE":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 animate-pulse";
      case "COMPLETED":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300";
      case "CANCELLED":
        return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
    }
  };

  const getNextStatusText = (status: ElectionStatus): { nextStatus: ElectionStatus; label: string } | null => {
    switch (status) {
      case "DRAFT":
        return { nextStatus: "NOMINATION", label: "Open Nominations" };
      case "NOMINATION":
        return { nextStatus: "VETTING", label: "Start Vetting" };
      case "VETTING":
        return { nextStatus: "ACTIVE", label: "Activate Voting" };
      case "ACTIVE":
        return { nextStatus: "COMPLETED", label: "Close & Complete" };
      default:
        return null;
    }
  };

  if (!elections) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <Vote className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">You don&apos;t have access to elections.</p>
      </div>
    );
  }

  if (elections.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <Vote className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">No elections or referendums created yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-glass-border bg-glass-card/35 backdrop-blur-md shadow-lg transition-all duration-300 hover:shadow-xl dark:bg-glass-card/15">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Title</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Timeline</TableHead>
            <TableHead>Privacy</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {elections.map((election) => {
            const nextAction = getNextStatusText(election.status);
            const isWorking = transitioningId === election.id;

            return (
              <TableRow key={election.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/governance/elections/${election.id}`}
                    className="flex items-center gap-1.5 hover:underline text-indigo-600 dark:text-indigo-400"
                  >
                    {election.title}
                    <ChevronRight className="size-3.5" aria-hidden />
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                    {election.type === "OFFICER" ? "Officer Slot" : "Referendum"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`${getStatusColor(election.status)} border-none py-0.5 px-2`}>
                    {election.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    <span>
                      {new Date(election.startsAt).toLocaleDateString()} - {new Date(election.endsAt).toLocaleDateString()}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {election.isAnonymous ? "Anonymous" : "Open Ballot"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {nextAction && (
                      <Button
                        size="xs"
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() => handleStatusChange(election.id, nextAction.nextStatus)}
                        className="bg-indigo-50/50 text-indigo-600 hover:bg-indigo-100/50 dark:bg-indigo-950/20 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                      >
                        {nextAction.label}
                      </Button>
                    )}
                    {election.status === "ACTIVE" && (
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={isWorking}
                        onClick={() => handleStatusChange(election.id, "CANCELLED")}
                      >
                        Cancel
                      </Button>
                    )}
                    <Link href={`/governance/elections/${election.id}`}>
                      <Button size="xs" variant="outline">
                        {election.status === "ACTIVE" || election.status === "COMPLETED" ? "Live Results" : "Manage"}
                      </Button>
                    </Link>
                  </div>
                </TableCell>

              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
