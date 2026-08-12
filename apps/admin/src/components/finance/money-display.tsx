import { cn } from "@/lib/utils";

// The one place money ever gets formatted — every screen that shows a
// Cedi amount goes through this, so the "tabular numerals, GH¢ prefix,
// never a raw float" rule from the design plan can't be forgotten on a
// one-off screen. `value` is always the numeric-string the API returns
// (Prisma Decimal serialized to string) — never a JS number, so precision
// is never at risk before this component even sees it.
interface MoneyDisplayProps {
  value: string | number;
  currency?: string;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "default" | "good" | "warn" | "bad" | "muted";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<MoneyDisplayProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl tracking-tight",
  xl: "text-3xl tracking-tight",
};

const TONE_CLASSES: Record<NonNullable<MoneyDisplayProps["tone"]>, string> = {
  default: "text-foreground",
  good: "text-status-good",
  warn: "text-status-warn",
  bad: "text-status-bad",
  muted: "text-muted-foreground",
};

export function MoneyDisplay({
  value,
  currency = "GHS",
  size = "md",
  tone = "default",
  className,
}: MoneyDisplayProps) {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : value;
  const isNegative = numeric < 0;
  const formatted = Math.abs(numeric).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = currency === "GHS" ? "GH₵" : `${currency} `;

  return (
    <span
      className={cn(
        "font-mono tabular-nums font-semibold",
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className,
      )}
    >
      {isNegative ? "−" : ""}
      {symbol}
      {formatted}
    </span>
  );
}
