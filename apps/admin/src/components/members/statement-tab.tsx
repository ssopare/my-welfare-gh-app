import { MoneyDisplay } from "@/components/finance/money-display";
import { StatusBadge } from "@/components/finance/status-badge";
import { StatusGuide } from "@/components/finance/status-guide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLAIM_STATUS_META, OBLIGATION_STATUS_META } from "@/lib/status-meta";
import type { MemberStatement } from "@welfare/shared-types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

// FR-CLM/FR-LEDGER's "full payment history, standing status, benefit
// history, paid-through date" — the report as an actual dashboard on the
// member's own profile, not raw JSON, and not a second navigation path
// away from the Member 360 view that already has this member's context.
export function StatementTab({ statement, currency }: { statement: MemberStatement; currency: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border/50 bg-card/55 shadow-md backdrop-blur-xl">
        <CardContent className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Paid through</span>
          <span className="text-sm font-medium">
            {statement.paidThroughDate ? formatDate(statement.paidThroughDate) : "No contributions paid yet"}
          </span>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Obligations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {statement.obligations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No contribution obligations recorded.</p>
          ) : (
            <>
              <StatusGuide
                items={[
                  { tone: "good", label: "Paid", description: "Contribution received in full." },
                  { tone: "warn", label: "Partially paid", description: "Some, but not all, of this obligation has been paid." },
                  { tone: "warn", label: "Due", description: "Not yet paid, but not past its due date." },
                  { tone: "bad", label: "Overdue", description: "Payment was not received by the due date." },
                ]}
              />
              <div className="overflow-hidden rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Plan</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.obligations.map((obligation) => (
                      <TableRow key={obligation.id}>
                        <TableCell className="text-sm text-muted-foreground">{obligation.contributionPlan?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(obligation.dueDate)}</TableCell>
                        <TableCell>
                          <MoneyDisplay value={obligation.amountValue} currency={obligation.currency} size="sm" />
                        </TableCell>
                        <TableCell>
                          <MoneyDisplay value={obligation.amountPaid} currency={obligation.currency} size="sm" tone="good" />
                        </TableCell>
                        <TableCell>
                          <StatusBadge {...OBLIGATION_STATUS_META[obligation.status]} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {statement.payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {statement.payments.map((payment) => (
                <li key={payment.journalEntryId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{payment.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(payment.postedAt)}</p>
                  </div>
                  <MoneyDisplay
                    value={Number.parseFloat(payment.debit) > 0 ? payment.debit : payment.credit}
                    currency={currency}
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Benefit claims</CardTitle>
        </CardHeader>
        <CardContent>
          {statement.claims.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No benefit claims filed.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {statement.claims.map((claim) => (
                <li key={claim.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{claim.benefitRule?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(claim.eventDate)}</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <MoneyDisplay value={claim.amountValue} currency={claim.currency} size="sm" />
                    <StatusBadge {...CLAIM_STATUS_META[claim.status]} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
