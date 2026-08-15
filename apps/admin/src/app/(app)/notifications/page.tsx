import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CreditCard,
  Gavel,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@welfare/shared-types";
import { markAllReadAction, markReadAction } from "./actions";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";

export const metadata: Metadata = {
  title: "Notifications — Welfare Platform",
};

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  CONTRIBUTION_DUE_REMINDER: CalendarClock,
  DEFAULTER_RISK_ALERT: AlertTriangle,
  CLAIM_STAGE_ENTERED: Gavel,
  CLAIM_STATUS_CHANGED: Gavel,
  SUBSCRIPTION_LAPSED: CreditCard,
};

// Only source types with a real destination route get linked — an honest
// reflection of what's actually built, not a link to a page that doesn't
// exist yet (obligations and subscriptions have no standalone admin route
// as of this milestone).
function sourceHref(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;
  if (sourceType === "claim") return `/claims/${sourceId}`;
  if (sourceType === "contribution_plan") return `/rules/plans/${sourceId}`;
  return null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { token, identity } = await requireSession();
  const { filter } = await searchParams;
  const showUnreadOnly = filter === "unread";

  const notifications = await apiFetchOrNull<Notification[]>(`/members/${identity.memberId}/notifications`, {
    token,
    cache: "no-store",
  });
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;
  const filtered = showUnreadOnly ? notifications?.filter((n) => !n.readAt) : notifications;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Notifications"
        subtitle="Due-date reminders and claim status updates."
        icon={Bell}
        theme="indigo"
        rightAction={
          unreadCount > 0 ? (
            <AsyncActionButton label="Mark all read" action={markAllReadAction.bind(null, identity.memberId)} />
          ) : undefined
        }
      />

      <div className="flex gap-2">
        <FilterChip href="/notifications" active={!showUnreadOnly}>
          All{notifications ? ` (${notifications.length})` : ""}
        </FilterChip>
        <FilterChip href="/notifications?filter=unread" active={showUnreadOnly}>
          Unread ({unreadCount})
        </FilterChip>
      </div>

      <Card className="border-glass-border bg-glass-card/65 shadow-lg backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:bg-glass-card/45">
        <CardContent>
          {!filtered ? (
            <p className="py-10 text-center text-sm text-muted-foreground">You don&apos;t have access to notifications.</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Bell className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {showUnreadOnly ? "Nothing unread — you're all caught up." : "No notifications yet."}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {filtered.map((notification) => {
                const Icon = TYPE_ICON[notification.type];
                const href = sourceHref(notification.sourceType, notification.sourceId);
                const unread = !notification.readAt;
                const content = (
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        unread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-sm", unread && "font-medium")}>{notification.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(notification.createdAt)}</p>
                    </div>
                  </div>
                );

                return (
                  <li key={notification.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    {href ? (
                      <Link href={href} className="min-w-0 flex-1 rounded-md transition-colors hover:bg-accent">
                        {content}
                      </Link>
                    ) : (
                      <div className="min-w-0 flex-1">{content}</div>
                    )}
                    {unread && (
                      <AsyncActionButton label="Mark read" action={markReadAction.bind(null, notification.id)} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
