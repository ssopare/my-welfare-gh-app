import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, PiggyBank } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { AdvanceContributionRow, Organisation } from "@welfare/shared-types";

export const metadata: Metadata = {
  title: "Advance Contributions — Welfare Platform",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function AdvanceContributionsPage() {
  const { token } = await requireSession();

  const [organisation, rows] = await Promise.all([
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
    apiFetchOrNull<AdvanceContributionRow[]>("/reports/advance-contributions", { token, cache: "no-store" }),
  ]);
  const currency = organisation?.currency ?? "GHS";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Advance Contributions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Members currently carrying a real credit balance — an overpayment already parked against their
          account, ready to be swept into their next due contribution automatically.
        </p>
      </div>

      {!rows ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to this report.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PiggyBank className="size-4 text-status-good" aria-hidden />
              Members with a credit balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No member is currently carrying an advance credit balance.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Member</TableHead>
                      <TableHead className="text-right">Credit balance</TableHead>
                      <TableHead>Next obligation this will cover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.memberId}>
                        <TableCell>
                          <p className="text-sm font-medium">{row.name ?? "—"}</p>
                          <p className="font-mono text-xs text-muted-foreground">{row.phoneNumber}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <MoneyDisplay value={row.creditBalance} currency={currency} size="sm" tone="good" />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.nextObligation ? (
                            <>
                              {row.nextObligation.planName} due {formatDate(row.nextObligation.dueDate)} ·{" "}
                              <MoneyDisplay value={row.nextObligation.amountOutstanding} currency={currency} size="sm" />
                            </>
                          ) : (
                            "Nothing open — fully paid up"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
