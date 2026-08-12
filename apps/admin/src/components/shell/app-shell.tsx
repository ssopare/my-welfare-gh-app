"use client";

import { useState, type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Notification, SubscriptionStatus } from "@welfare/shared-types";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { CommandPalette } from "./command-palette";

interface AppShellProps {
  organisationName: string;
  subscriptionStatus: SubscriptionStatus;
  role: "ADMIN" | "MEMBER";
  notifications: Notification[];
  children: ReactNode;
}

export function AppShell({
  organisationName,
  subscriptionStatus,
  role,
  notifications,
  children,
}: AppShellProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  return (
    <SidebarProvider>
      <AppSidebar organisationName={organisationName} subscriptionStatus={subscriptionStatus} role={role} />
      <SidebarInset className="shell-ambient">
        <AppTopbar
          role={role}
          notifications={notifications}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />
        <div className="flex-1 p-4 sm:p-6">{children}</div>
      </SidebarInset>
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </SidebarProvider>
  );
}
