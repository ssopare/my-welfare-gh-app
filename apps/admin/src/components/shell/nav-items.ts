import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Bell,
  Gavel,
  LayoutDashboard,
  LineChart,
  Scale,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

// The build sequence from the admin UI design plan, in the same
// dependency order the backend itself was built — this list grows one
// entry per milestone rather than being fully populated up front, so an
// unbuilt route never sits in the nav pointing at a page that doesn't
// exist yet.
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Milestone 1 only builds the dashboard — every other route is a real,
   * intentional part of the information architecture but isn't wired to a
   * page yet. Shown disabled with a "soon" label rather than as a link
   * that would 404, so the shell's shape is honest about what's actually
   * built right now. */
  comingSoon?: boolean;
  /** Every one of these pages needs an organisation-scoped RBAC permission
   * the starter "Member" role template never grants (it only ever gets
   * own-scope claim/member access — see STARTER_ROLE_TEMPLATES on the
   * API). This console is an admin/officer tool; a Member account can
   * still log in (the same /auth/login serves both apps) but has nothing
   * real to do here, so the sidebar hides these rather than link to pages
   * that will just show "no access" everywhere. */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, adminOnly: true },
  { label: "Members", href: "/members", icon: Users, adminOnly: true },
  { label: "Rules & Benefits", href: "/rules", icon: Scale, adminOnly: true },
  { label: "Ledger", href: "/ledger", icon: Wallet, adminOnly: true },
  { label: "Roles & Access", href: "/roles", icon: ShieldCheck, adminOnly: true },
  { label: "Claims", href: "/claims", icon: Gavel, adminOnly: true },
  { label: "Defaulters", href: "/defaulters", icon: AlertTriangle, adminOnly: true },
  { label: "Governance", href: "/governance", icon: BadgeCheck, adminOnly: true },
  { label: "Reports", href: "/reports", icon: LineChart, adminOnly: true },
  { label: "Notifications", href: "/notifications", icon: Bell, adminOnly: true },
  { label: "Billing", href: "/billing", icon: Banknote, adminOnly: true },
  { label: "Settings", href: "/settings", icon: Settings, adminOnly: true },
];
