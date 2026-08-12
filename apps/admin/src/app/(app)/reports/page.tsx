import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, LineChart, UserSearch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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
];

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every report here is a live query over the ledger and claim history — never a stored, separately-editable
          number.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <Link key={report.href} href={report.href}>
            <Card className="h-full border-border/60 shadow-md transition-shadow hover:shadow-lg">
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
