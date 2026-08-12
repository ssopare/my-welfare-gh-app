import Link from "next/link";
import { AlertTriangle, Clock, ShieldAlert, UserMinus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Replaces the old per-member AttentionList with 4 aggregate category
// tiles — closer to "how much needs attention, by kind" than a raw list,
// each linking to the real page that already handles that kind. Real data
// only: "Policy Exceptions" is unresolved reconciliation exceptions and
// "Pending Removals" is the maker-checker removal-request queue — there's
// no "Escalated Issues" concept anywhere in this system (no ESCALATED
// claim status exists), so nothing here stands in for one.
interface AttentionTilesProps {
  pendingClaims: number;
  overdueContributions: number;
  policyExceptions: number;
  pendingRemovals: number;
}

const TILES = [
  { key: "pendingClaims", label: "Pending claims", icon: Clock, href: "/claims?status=SUBMITTED" },
  { key: "overdueContributions", label: "Overdue contributions", icon: AlertTriangle, href: "/defaulters" },
  { key: "policyExceptions", label: "Policy exceptions", icon: ShieldAlert, href: "/ledger/reconciliation" },
  { key: "pendingRemovals", label: "Pending removals", icon: UserMinus, href: "/members/removal-requests" },
] as const;

export function AttentionTiles({
  pendingClaims,
  overdueContributions,
  policyExceptions,
  pendingRemovals,
}: AttentionTilesProps) {
  const values: Record<(typeof TILES)[number]["key"], number> = {
    pendingClaims,
    overdueContributions,
    policyExceptions,
    pendingRemovals,
  };
  const total = pendingClaims + overdueContributions + policyExceptions + pendingRemovals;

  return (
    <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-status-warn" aria-hidden />
          Attention required
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {total === 0
            ? "Nothing needs your attention right now."
            : `${total} item${total === 1 ? "" : "s"} need your attention`}
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILES.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/40 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-status-warn-bg text-status-warn">
              <tile.icon className="size-4" aria-hidden />
            </div>
            <p className="font-mono text-xl font-semibold tabular-nums">{values[tile.key]}</p>
            <p className="text-xs text-muted-foreground">{tile.label}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
