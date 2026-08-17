import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  BookOpen,
  HeartPulse,
  Landmark,
  LineChart,
  PiggyBank,
  Scale,
  ScrollText,
  ShieldAlert,
  Target,
  Undo2,
  UserSearch,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export const metadata: Metadata = {
  title: "Reports — Welfare Platform",
};

const REPORTS = [
  {
    href: "/reports/contributions",
    icon: LineChart,
    title: "Contribution summary",
    description: "Expected vs. collected, by plan and chapter, over any date range.",
  },
  {
    href: "/defaulters",
    icon: AlertTriangle,
    title: "Defaulter register",
    description: "Members in arrears with an aging breakdown of how overdue each period is.",
  },
  {
    href: "/reports/disbursements",
    icon: Banknote,
    title: "Disbursement report",
    description: "Every paid benefit claim, its amount, and its full approver trail.",
  },
  {
    href: "/reports/manual-payments",
    icon: ShieldAlert,
    title: "Manually Recorded Payments",
    description: "Every contribution an admin attested was received rather than the provider verifying it — who recorded what, and when.",
  },
  {
    href: "/reports/income-expenditure",
    icon: ScrollText,
    title: "Income & Expenditure Statement",
    description: "Formal income and expenditure lines with a Surplus/(Deficit) total, by fund and period.",
  },
  {
    href: "/reports/trial-balance",
    icon: Scale,
    title: "Trial Balance",
    description: "Every ledger account's net balance, as of any date — flags a real imbalance instead of hiding it.",
  },
  {
    href: "/reports/general-ledger",
    icon: BookOpen,
    title: "General Ledger",
    description: "Every line posted to one account, in order, with a running balance.",
  },
  {
    href: "/reports/chart-of-accounts",
    icon: Landmark,
    title: "Chart of Accounts",
    description: "Every fund's standard chart — Cash, Income, Payable, Expense, and Equity accounts.",
  },
  {
    href: "/reports/budget-vs-actual",
    icon: Target,
    title: "Budget vs. Actual",
    description: "Set a target for any Income or Expense account and track it against real ledger activity.",
  },
  {
    href: "/reports/advance-contributions",
    icon: PiggyBank,
    title: "Advance Contributions",
    description: "Members currently carrying a credit balance from an overpayment, and what it will cover next.",
  },
  {
    href: "/reports/arrears-allocation",
    icon: AlertCircle,
    title: "Arrears Allocation",
    description: "Every contribution payment's real period vs. its actual cash-collection date.",
  },
  {
    href: "/reports/benefit-expenditure",
    icon: HeartPulse,
    title: "Benefit Expenditure Analytics",
    description: "Every claim at every lifecycle stage, grouped by benefit type — not just the paid ones.",
  },
  {
    href: "/reports/financial-health",
    icon: Activity,
    title: "Financial Health",
    description: "Collection, arrears, payout, and utilisation ratios rolled up into one overall status.",
  },
  {
    href: "/reports/cash-flow",
    icon: ArrowRightLeft,
    title: "Cash Flow Statement",
    description: "Operating, financing, and investing activity, opening cash through to closing cash.",
  },
  {
    href: "/reports/fund-position",
    icon: Wallet,
    title: "Fund Position Report",
    description: "Every fund's opening/closing balance, income, expenses, transfers, cash, and payables.",
  },
  {
    href: "/reports/reversals",
    icon: Undo2,
    title: "Reversals & Adjustments",
    description: "Every reversal linked to its original entry, plus Gross/Net collection for the period.",
  },
];

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Reports"
        subtitle="Every report here is a live query over the ledger and claim history — never a stored, separately-editable number."
        icon={LineChart}
        watermarkIcon={ScrollText}
        theme="emerald"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <Link key={report.href} href={report.href}>
            <Card className="h-full border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 dark:bg-glass-card/45">
              <CardContent className="flex flex-col gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                  <report.icon className="size-4" aria-hidden />
                </div>
                <div>
                  <p className="font-medium">{report.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-border/60 border-dashed shadow-none">
        <CardContent className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <UserSearch className="size-4" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">
            Looking for one member&apos;s full payment history and benefit claims? Open their profile under{" "}
            <Link href="/members" className="font-medium text-primary hover:underline">
              Members
            </Link>{" "}
            — the Statement tab is their report.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
