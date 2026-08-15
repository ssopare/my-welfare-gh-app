import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, Wallet } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { Button } from "@/components/ui/button";
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
import type { AuthStrategy, Fund, JournalEntry, LedgerAccountBalance, Member, Organisation } from "@welfare/shared-types";
import { CreateFundDialog } from "./create-fund-dialog";
import { PaymentAllocationSetting } from "./payment-allocation-setting";
import { AuthStrategySetting } from "./auth-strategy-setting";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { ReverseEntryDialog } from "./reverse-entry-dialog";
import { TransferFundsDialog } from "./transfer-funds-dialog";
import { BulkUploadPaymentsDialog } from "@/components/finance/bulk-upload-payments-dialog";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export const metadata: Metadata = {
  title: "Ledger — Welfare Platform",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function entryTotal(entry: JournalEntry): string {
  return entry.lines
    .reduce((sum, line) => sum + Number.parseFloat(line.debit), 0)
    .toFixed(2);
}

async function fundWithBalances(fund: Fund, token: string) {
  const balances = await Promise.all(
    fund.ledgerAccounts.map((account) =>
      apiFetchOrNull<LedgerAccountBalance>(`/ledger-accounts/${account.id}/balance`, {
        token,
        cache: "no-store",
      }),
    ),
  );
  return { fund, balances: fund.ledgerAccounts.map((account, i) => ({ account, balance: balances[i] })) };
}

export default async function LedgerPage() {
  const { token } = await requireSession();

  const [funds, entries, members, organisation] = await Promise.all([
    apiFetchOrNull<Fund[]>("/funds", { token, cache: "no-store" }),
    apiFetchOrNull<JournalEntry[]>("/journal-entries", { token, cache: "no-store" }),
    apiFetchOrNull<Member[]>("/members", { token, cache: "no-store" }),
    apiFetchOrNull<Organisation>("/organisation", { token, cache: "no-store" }),
  ]);
  const currency = organisation?.currency ?? "GHS";

  const fundsWithBalances = funds ? await Promise.all(funds.map((fund) => fundWithBalances(fund, token))) : null;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Welfare"
        highlightedText="Ledger"
        subtitle="Fund balances and posted transactions. Every entry is balanced — nothing here is a stored, editable number."
        icon={Landmark}
        badgeText="Financial Registry"
        rightAction={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/5 hover:bg-white/10 hover:text-white text-white font-bold uppercase tracking-widest text-[9px] h-9 px-4 rounded-xl shadow-md transition-all"
              asChild
            >
              <Link href="/ledger/payouts">Treasury & Payouts</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/5 hover:bg-white/10 hover:text-white text-white font-bold uppercase tracking-widest text-[9px] h-9 px-4 rounded-xl shadow-md transition-all"
              asChild
            >
              <Link href="/ledger/reconciliation">Reconciliation</Link>
            </Button>
            <CreateFundDialog
              className="border-white/20 bg-white/5 hover:bg-white/10 hover:text-white text-white font-bold uppercase tracking-widest text-[9px] h-9 px-4 rounded-xl shadow-md transition-all"
            />
            {funds && members && (
              <>
                <BulkUploadPaymentsDialog
                  members={members}
                  funds={funds}
                  className="border-white/20 bg-white/5 hover:bg-white/10 hover:text-white text-white font-bold uppercase tracking-widest text-[9px] h-9 px-4 rounded-xl shadow-md transition-all"
                />
                <RecordPaymentDialog funds={funds} members={members} organisation={organisation} />
              </>
            )}
          </div>
        }
      />

      {organisation && (
        <div className="flex flex-col gap-6 p-6 rounded-xl border border-glass-border bg-glass-card/35 backdrop-blur-md mb-6 dark:bg-glass-card/15">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Organisation Settings</h3>
          <div className="flex flex-col md:flex-row gap-6 md:gap-12">
            <PaymentAllocationSetting policy={organisation.paymentAllocationPolicy} />
            <AuthStrategySetting strategy={organisation.authStrategy as AuthStrategy} />
          </div>
        </div>
      )}

      {!fundsWithBalances ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Landmark className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">You don&apos;t have access to the ledger.</p>
        </div>
      ) : fundsWithBalances.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Landmark className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No funds set up yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {fundsWithBalances.map(({ fund, balances }) => (
            <Card key={fund.id} className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-[1.01] hover:shadow-xl hover:border-primary/20 dark:bg-glass-card/45">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="size-4 text-primary" aria-hidden />
                  {fund.name}
                </CardTitle>
                {funds && (
                  <TransferFundsDialog
                    fromFund={fund}
                    otherFunds={funds.filter((f) => f.id !== fund.id)}
                  />
                )}
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y divide-border">
                  {balances.map(({ account, balance }) => (
                    <li key={account.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                      <span className="text-sm text-muted-foreground">{account.name}</span>
                      {balance ? (
                        <MoneyDisplay value={balance.balance} currency={currency} size="sm" />
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
        <CardHeader>
          <CardTitle className="text-base">Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {!entries || entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {entries === null ? "You don't have access to transaction history." : "No transactions posted yet."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Posted</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className="group transition-colors duration-150 hover:bg-primary/5">
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(entry.postedAt)}</TableCell>
                      <TableCell className="max-w-md truncate text-sm">
                        {entry.description}
                        {entry.reversalOfId && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Reversal
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <MoneyDisplay value={entryTotal(entry)} currency={currency} size="sm" />
                      </TableCell>
                      <TableCell>
                        {!entry.reversalOfId && (
                          <ReverseEntryDialog
                            entryId={entry.id}
                            description={entry.description}
                            amount={entryTotal(entry)}
                            currency={currency}
                          />
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
    </div>
  );
}
