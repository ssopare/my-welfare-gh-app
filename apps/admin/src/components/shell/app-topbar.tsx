"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Notification } from "@welfare/shared-types";
import { NotificationBell } from "./notification-bell";
import { PrintButton } from "./print-button";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppTopbar({
  role,
  notifications,
  onOpenCommandPalette,
}: {
  role: "ADMIN" | "MEMBER";
  notifications: Notification[];
  onOpenCommandPalette: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-md">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />

      <Button
        variant="outline"
        className="ml-1 h-9 w-full max-w-sm justify-start gap-2 text-muted-foreground sm:w-64"
        onClick={onOpenCommandPalette}
      >
        <Search className="size-4" />
        <span className="text-sm">Jump to…</span>
        <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <PrintButton />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ThemeToggle />
        <NotificationBell notifications={notifications} />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <UserMenu role={role} />
      </div>
    </header>
  );
}
