"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { Check, ChevronsUpDown, HeartHandshake, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { switchOrganisationAction } from "@/app/(app)/organisations/switch-actions";
import { NAV_ITEMS } from "./nav-items";
import type { MyOrganisationMembership, SubscriptionStatus } from "@welfare/shared-types";

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
  myOrganisations,
}: {
  organisationName: string;
  subscriptionStatus: SubscriptionStatus;
  role: "ADMIN" | "MEMBER";
  myOrganisations: MyOrganisationMembership[];
}) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || role === "ADMIN");
  const [isSwitching, startTransition] = useTransition();
  // Only accounts that actually belong to more than one organisation get
  // the switcher affordance — nothing to switch to otherwise, same "don't
  // show a picker with one option" reasoning as everywhere else in this
  // console.
  const canSwitch = myOrganisations.length > 1;

  function handleSwitch(organisationId: string) {
    startTransition(async () => {
      await switchOrganisationAction(organisationId);
    });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {canSwitch ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={isSwitching}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent disabled:opacity-60"
                disabled={isSwitching}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_2px_6px_-1px_color-mix(in_srgb,var(--primary)_50%,transparent)]">
                  {isSwitching ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <HeartHandshake className="size-4" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-semibold leading-tight">{organisationName}</p>
                  <p className="truncate text-xs text-muted-foreground leading-tight">Welfare Platform</p>
                </div>
                <ChevronsUpDown
                  className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
                  aria-hidden
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Your organisations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {myOrganisations.map((org) => (
                <DropdownMenuItem
                  key={org.organisationId}
                  disabled={org.isCurrent || isSwitching}
                  onSelect={() => !org.isCurrent && handleSwitch(org.organisationId)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">{org.legalName}</span>
                  {org.isCurrent && <Check className="size-4 text-primary" aria-hidden />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_2px_6px_-1px_color-mix(in_srgb,var(--primary)_50%,transparent)]">
              <HeartHandshake className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold leading-tight">{organisationName}</p>
              <p className="truncate text-xs text-muted-foreground leading-tight">Welfare Platform</p>
            </div>
          </div>
        )}
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
