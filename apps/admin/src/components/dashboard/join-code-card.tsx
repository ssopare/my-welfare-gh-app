"use client";

import { useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-[1.005] hover:shadow-xl hover:border-primary/20 dark:bg-glass-card/45">
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <UserPlus className="size-4" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium">Invite members to {legalName}</p>
            <p className="text-xs text-muted-foreground">Share this join code — they&apos;ll enter it alongside their phone number.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-glass-border bg-muted/50 px-3 py-1.5 font-mono text-sm font-semibold tracking-wide text-primary shadow-inner tabular-nums">
            {joinCode}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
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
      </CardContent>
    </Card>
  );
}
