import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platformLogoutAction } from "@/lib/actions/platform-logout";
import { requirePlatformSession } from "@/lib/platform-session";

// Deliberately its own small shell, not a reuse of the tenant AppShell —
// two screens' worth of navigation doesn't need a collapsible sidebar,
// command palette, or notification bell, and building one would imply a
// scope this area was never meant to have (see the admin UI design plan's
// "separate, smaller Platform Operator area" note).
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const { operator } = await requirePlatformSession();

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md sm:px-6">
        <Link href="/platform" className="flex items-center gap-2 font-semibold">
          <Server className="size-4" aria-hidden />
          Platform Operator
        </Link>
        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/platform">Subscriptions</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/platform/plans">Plans</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/platform/notifications">Notifications</Link>
          </Button>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{operator.email}</span>
          <form action={platformLogoutAction}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Sign out">
              <LogOut aria-hidden />
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
