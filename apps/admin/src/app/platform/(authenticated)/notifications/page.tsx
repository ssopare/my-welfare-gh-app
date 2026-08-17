import type { Metadata } from "next";
import { BellRing } from "lucide-react";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { Badge } from "@/components/ui/badge";
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
import type { NotificationChannelSetting, NotificationType } from "@welfare/shared-types";
import { toggleNotificationChannelSmsAction } from "../actions";

export const metadata: Metadata = {
  title: "Notification Channels — Platform Operator",
};

// Human labels + one-line context per type — the settings list itself
// comes from the API (source of truth for which types exist), this is
// purely presentational.
const TYPE_LABEL: Record<NotificationType, { label: string; description: string }> = {
  CONTRIBUTION_DUE_REMINDER: {
    label: "Contribution due reminder",
    description: "Sent as a member's next contribution approaches its due date.",
  },
  DEFAULTER_RISK_ALERT: {
    label: "Defaulter risk alert",
    description: "Sent when a member crosses into missed-contribution risk.",
  },
  CLAIM_STAGE_ENTERED: {
    label: "Claim stage entered",
    description: "Sent each time a claim moves into a new approval stage.",
  },
  CLAIM_STATUS_CHANGED: {
    label: "Claim status changed",
    description: "Sent when a claim is approved, rejected, or paid.",
  },
  SUBSCRIPTION_LAPSED: {
    label: "Subscription lapsed",
    description: "Sent to an organisation's admins when its billing subscription lapses.",
  },
  MEMBER_JOIN_PENDING: {
    label: "Member join pending",
    description: "Sent to org admins when a new join request needs approval.",
  },
};

export default async function PlatformNotificationsPage() {
  const { token } = await requirePlatformSession();
  const settings = await apiFetchOrNull<NotificationChannelSetting[]>("/platform/notification-channel-settings", {
    token,
    cache: "no-store",
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notification channels</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every notification type always lands in-app. Turning SMS on for a type additionally dispatches it through
          the SMS gateway (Arkesel → mNotify → Hubtel failover) to the member&apos;s phone number.
        </p>
      </div>

      {!settings ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <BellRing className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Could not load notification channel settings.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 shadow-md">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Notification type</TableHead>
                <TableHead>SMS</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((setting) => {
                const meta = TYPE_LABEL[setting.notificationType];
                return (
                  <TableRow key={setting.notificationType}>
                    <TableCell>
                      <div className="font-medium">{meta?.label ?? setting.notificationType}</div>
                      <div className="text-xs text-muted-foreground">{meta?.description}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={setting.smsEnabled ? "border-status-good-border bg-status-good-bg text-status-good" : ""}
                      >
                        {setting.smsEnabled ? "SMS on" : "SMS off"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AsyncActionButton
                        label={setting.smsEnabled ? "Turn off" : "Turn on"}
                        variant={setting.smsEnabled ? "destructive" : "outline"}
                        action={toggleNotificationChannelSmsAction.bind(null, setting.notificationType, !setting.smsEnabled)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
