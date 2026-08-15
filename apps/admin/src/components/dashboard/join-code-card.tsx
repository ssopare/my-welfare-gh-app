"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function JoinCodeWidget({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/10 p-1 border border-white/10 backdrop-blur-md">
      <span className="px-3 py-1 text-xs font-mono font-bold tracking-wider text-white select-all">
        {joinCode}
      </span>
      <Button
        type="button"
        size="xs"
        onClick={copy}
        className="h-7 rounded-lg bg-white px-2.5 text-[10px] font-black uppercase tracking-wider text-slate-950 hover:bg-white/90 shadow-sm transition-all"
      >
        {copied ? (
          <>
            <Check className="size-3 text-status-good animate-in fade-in zoom-in-50 duration-200" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3" />
            Copy Code
          </>
        )}
      </Button>
    </div>
  );
}
