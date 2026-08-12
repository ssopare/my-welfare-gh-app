import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { MoneyDisplay } from "@/components/finance/money-display";
import { StatusBadge } from "@/components/finance/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetchOrNull } from "@/lib/api-client";
import { requirePlatformSession } from "@/lib/platform-session";
import { SUBSCRIPTION_STATUS_META } from "@/lib/status-meta";
import type { PlatformSubscriptionRow } from "@welfare/shared-types";
import { UpdateStatusDialog } from "./update-status-dialog";

export const metadata: Metadata = {
  title: "Tenant Subscriptions — Platform Operator",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" });
}

export default async function PlatformSubscriptionsPage() {
  const { token } = await requirePlatformSession();
  const subscriptions = await apiFetchOrNull<PlatformSubscriptionRow[]>("/platform/subscriptions", {
    token,
    cache: "no-store",
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tenant subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every organisation on the platform, across every tenant.</p>
      </div>

      {!subscriptions ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <Building2 className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No subscriptions found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 shadow-md">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Organisation</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period ends</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell className="font-medium">
                    {subscription.organisation?.legalName ?? (
                      <span className="italic text-muted-foreground">Unknown organisation</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {subscription.plan ? (
                      <MoneyDisplay value={subscription.plan.priceAmount} currency={subscription.plan.currency} size="sm" />
                    ) : (
                      "No plan"
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge {...SUBSCRIPTION_STATUS_META[subscription.status]} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {subscription.status === "TRIAL" ? formatDate(subscription.trialEndsAt) : formatDate(subscription.currentPeriodEnd)}
                  </TableCell>
                  <TableCell>
                    <UpdateStatusDialog subscription={subscription} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
