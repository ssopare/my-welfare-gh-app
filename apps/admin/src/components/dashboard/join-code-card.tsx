"use client";

import { useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "./dashboard-header";

// The one place an admin can actually find and share the code a member
// needs to join — nothing surfaced this anywhere before (confirmed by
// grep: registration used to redirect straight to the dashboard with no
// success screen, and no settings page existed either). Placed on the
// dashboard itself since that's exactly where an admin lands right after
// registering, when they most need it.
export function JoinCodeCard({ joinCode, legalName }: { joinCode: string; legalName: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <DashboardHeader
      title="Invite members to"
      highlightedText={legalName}
      subtitle="Share this join code — they'll enter it alongside their phone number."
      icon={UserPlus}
      badgeText="Member Onboarding"
      rightAction={
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-primary/20 bg-primary/10 px-4 py-2 font-mono text-sm font-bold tracking-wide text-primary shadow-inner tabular-nums">
            {joinCode}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copy}
            className="border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-bold uppercase tracking-widest text-[10px] px-4 py-4 rounded-xl shadow-md transition-all"
          >
            {copied ? (
              <>
                <Check className="text-status-good" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy aria-hidden />
                Copy
              </>
            )}
          </Button>
        </div>
      }
    />
  );
}
