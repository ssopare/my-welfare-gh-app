"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Bell,
  Gavel,
  LayoutDashboard,
  LineChart,
  Scale,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

// Milestone 1's command palette only navigates the shell's own sections —
// searching *across* members/claims/plans needs those milestones' own data
// to search over, so it's deliberately not promised here yet. The
// keyboard shortcut and the dialog chrome (the actual "wow factor" — feels
// native the moment it's pressed) are real and complete now; the search
// index behind it grows milestone by milestone.
const NAVIGATION_COMMANDS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Members", href: "/members", icon: Users },
  { label: "Rules & Benefits", href: "/rules", icon: Scale },
  { label: "Ledger", href: "/ledger", icon: Wallet },
  { label: "Roles & Access", href: "/roles", icon: ShieldCheck },
  { label: "Claims", href: "/claims", icon: Gavel },
  { label: "Defaulters", href: "/defaulters", icon: AlertTriangle },
  { label: "Governance", href: "/governance", icon: BadgeCheck },
  { label: "Reports", href: "/reports", icon: LineChart },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Billing", href: "/billing", icon: Banknote },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Jump to" description="Search the console">
      <CommandInput placeholder="Jump to a section…" />
      <CommandList>
        <CommandEmpty>Nothing matched that.</CommandEmpty>
        <CommandGroup heading="Go to">
          {NAVIGATION_COMMANDS.map((item) => (
            <CommandItem key={item.href} onSelect={() => go(item.href)}>
              <item.icon />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
      </CommandList>
    </CommandDialog>
  );
}
