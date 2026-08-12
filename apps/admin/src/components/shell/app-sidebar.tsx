"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NAV_ITEMS } from "./nav-items";
import type { SubscriptionStatus } from "@welfare/shared-types";

const SUBSCRIPTION_LABEL: Record<SubscriptionStatus, string> = {
  TRIAL: "Free trial",
  ACTIVE: "Active",
  PAST_DUE: "Payment due",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
};

const SUBSCRIPTION_TONE: Record<SubscriptionStatus, string> = {
  TRIAL: "border-status-good-border bg-status-good-bg text-status-good",
  ACTIVE: "border-status-good-border bg-status-good-bg text-status-good",
  PAST_DUE: "border-status-warn-border bg-status-warn-bg text-status-warn",
  SUSPENDED: "border-status-bad-border bg-status-bad-bg text-status-bad",
  CANCELLED: "border-status-bad-border bg-status-bad-bg text-status-bad",
};

export function AppSidebar({
  organisationName,
  subscriptionStatus,
  role,
}: {
  organisationName: string;
  subscriptionStatus: SubscriptionStatus;
  role: "ADMIN" | "MEMBER";
}) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || role === "ADMIN");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_2px_6px_-1px_color-mix(in_srgb,var(--primary)_50%,transparent)]">
            <HeartHandshake className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold leading-tight">{organisationName}</p>
            <p className="truncate text-xs text-muted-foreground leading-tight">Welfare Platform</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {visibleItems.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                This console is for administrators. Use the My Welfare mobile app to manage your own account.
              </p>
            ) : (
              <SidebarMenu>
                {visibleItems.map((item) => {
                  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      {item.comingSoon ? (
                        <SidebarMenuButton
                          disabled
                          tooltip={`${item.label} — coming soon`}
                          className="cursor-not-allowed opacity-50"
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-1.5 group-data-[collapsible=icon]:hidden">
          <Badge variant="outline" className={SUBSCRIPTION_TONE[subscriptionStatus]}>
            {SUBSCRIPTION_LABEL[subscriptionStatus]}
          </Badge>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
