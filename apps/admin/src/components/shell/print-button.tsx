"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// One global print entry point rather than a bespoke button pasted into
// every report page — window.print() prints whatever's currently on
// screen, and the print stylesheet (globals.css) already strips the app
// shell down to just the report's own title/data. Lives inside AppTopbar,
// so it never needs its own print:hidden — the whole topbar is already
// hidden by that same stylesheet.
export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer aria-hidden />
      <span className="hidden sm:inline">Print / Save as PDF</span>
    </Button>
  );
}
