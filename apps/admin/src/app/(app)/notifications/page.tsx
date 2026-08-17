import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CreditCard,
  Gavel,
  Radio,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import type {
  Notification,
  NotificationType,
  SmsGatewaySummary,
  SmsLogItem,
} from "@welfare/shared-types";
import { markAllReadAction, markReadAction } from "./actions";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SmsGatewayTab } from "./sms-gateway-tab";

export const metadata: Metadata = {
  title: "Communication Hub — Welfare Platform",
};

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  CONTRIBUTION_DUE_REMINDER: CalendarClock,
  DEFAULTER_RISK_ALERT: AlertTriangle,
  CLAIM_STAGE_ENTERED: Gavel,
  CLAIM_STATUS_CHANGED: Gavel,
  SUBSCRIPTION_LAPSED: CreditCard,
  MEMBER_JOIN_PENDING: UserPlus,
};

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
  searchParams: Promise<{ filter?: string; tab?: string }>;
}) {
  const { token, identity } = await requireSession();
  const { filter, tab } = await searchParams;
  const currentTab = tab === "sms" ? "sms" : "inbox";
  const showUnreadOnly = filter === "unread";

  // Fetch in-app notifications and SMS gateway summary in parallel
  const [notifications, smsSummary, smsLogs] = await Promise.all([
    apiFetchOrNull<Notification[]>(`/members/${identity.memberId}/notifications`, {
      token,
      cache: "no-store",
    }),
    apiFetchOrNull<SmsGatewaySummary>("/sms/balances", {
      token,
      cache: "no-store",
    }),
    apiFetchOrNull<SmsLogItem[]>("/sms/logs?limit=40", {
      token,
      cache: "no-store",
    }),
  ]);

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;
  const filtered = showUnreadOnly ? notifications?.filter((n) => !n.readAt) : notifications;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Communication Hub"
        subtitle="Manage member notification feeds and monitor multi-tier SMS gateway balances."
        icon={Bell}
        theme="indigo"
        rightAction={
          currentTab === "inbox" && unreadCount > 0 ? (
            <AsyncActionButton label="Mark all read" action={markAllReadAction.bind(null, identity.memberId)} />
          ) : undefined
        }
      />

      {/* ── Main Tab Switcher ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="flex items-center gap-2">
          <Link
            href="/notifications?tab=inbox"
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
              currentTab === "inbox"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Bell className="size-4" />
            <span>Member Inboxes</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-xs font-bold">
                {unreadCount}
              </span>
            )}
          </Link>

          <Link
            href="/notifications?tab=sms"
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
              currentTab === "sms"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Radio className="size-4" />
            <span>Multi-Tier SMS Gateway</span>
            {smsSummary && (
              <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-xs font-bold tabular-nums">
                {smsSummary.totalAvailableSms.toLocaleString()} SMS
              </span>
            )}
          </Link>
        </div>

        {currentTab === "inbox" && (
          <div className="flex gap-2">
            <FilterChip href="/notifications?tab=inbox" active={!showUnreadOnly}>
              All{notifications ? ` (${notifications.length})` : ""}
            </FilterChip>
            <FilterChip href="/notifications?tab=inbox&filter=unread" active={showUnreadOnly}>
              Unread ({unreadCount})
            </FilterChip>
          </div>
        )}
      </div>

      {/* ── Tab Content: In-App Notifications ── */}
      {currentTab === "inbox" && (
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
      )}

      {/* ── Tab Content: Multi-Tier SMS Gateway ── */}
      {currentTab === "sms" && (
        <SmsGatewayTab summary={smsSummary} logs={smsLogs} />
      )}
    </div>
  );
}
