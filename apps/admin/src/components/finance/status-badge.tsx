import { cn } from "@/lib/utils";

export type StatusTone = "good" | "warn" | "bad" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  good: "border-status-good-border bg-status-good-bg text-status-good animate-pulse-emerald",
  warn: "border-status-warn-border bg-status-warn-bg text-status-warn animate-pulse-amber",
  bad: "border-status-bad-border bg-status-bad-bg text-status-bad animate-pulse-rose",
  neutral: "border-border bg-muted text-muted-foreground",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  good: "bg-status-good",
  warn: "bg-status-warn",
  bad: "bg-status-bad",
  neutral: "bg-muted-foreground",
};

// Color is never the only signal (design plan principle #4) — every badge
// pairs its tone with a dot *and* a word, so it still reads correctly in
// grayscale or to someone who can't distinguish the hues.
export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT_CLASSES[tone])} aria-hidden />
      {label}
    </span>
  );
}
