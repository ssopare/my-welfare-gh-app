import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { Fund, LedgerAccountType } from "@welfare/shared-types";
import { NewAccountDialog } from "./new-account-dialog";

export const metadata: Metadata = {
  title: "Chart of Accounts — Welfare Platform",
};

const TYPE_TONE: Record<LedgerAccountType, string> = {
  ASSET: "border-status-good-border bg-status-good-bg text-status-good",
  LIABILITY: "border-status-warn-border bg-status-warn-bg text-status-warn",
  INCOME: "border-status-good-border bg-status-good-bg text-status-good",
  EXPENSE: "border-status-bad-border bg-status-bad-bg text-status-bad",
  EQUITY: "border-border bg-muted text-muted-foreground",
};

// Each fund's standard 6-account chart (FundService.
// STANDARD_CHART_OF_ACCOUNTS) is still provisioned automatically and
// still flat — no account codes or hierarchy, a deliberate scope
// boundary carried through Phase C too (see FundService.createAccount's
// comment). What changed in Phase C: an admin can now extend it with
// custom accounts via the dialog below, rather than this being read-only.
export default async function ChartOfAccountsPage() {
  const { token } = await requireSession();
  const funds = await apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" aria-hidden />
        Back to reports
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chart of Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every fund&apos;s standard chart, provisioned automatically the moment a fund is created.
        </p>
      </div>

      {!funds ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You don&apos;t have access to the ledger.
          </CardContent>
        </Card>
      ) : funds.length === 0 ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No funds set up yet.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {funds.map((fund) => (
            <Card key={fund.id} className="border-border/50 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="size-4 text-primary" aria-hidden />
                  {fund.name}
                </CardTitle>
                <NewAccountDialog fund={fund} />
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y divide-border">
                  {fund.ledgerAccounts.map((account) => (
                    <li key={account.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                      <span className="text-sm">{account.name}</span>
                      <span className="flex items-center gap-1.5">
                        {account.isAdministrative && (
                          <Badge variant="outline" className="border-border text-muted-foreground">
                            Admin
                          </Badge>
                        )}
                        <Badge variant="outline" className={TYPE_TONE[account.type]}>
                          {account.type}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
