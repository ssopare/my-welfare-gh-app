import Link from "next/link";
import { cn } from "@/lib/utils";

// A single filter option rendered as a pill link — used for status filters
// across list screens (Members here, Claims/Defaulters later). A plain
// link rather than a client-side toggle so the filtered view is a real,
// shareable/bookmarkable URL and the list itself can stay a Server
// Component.
export function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-sm font-medium transition-colors",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}
