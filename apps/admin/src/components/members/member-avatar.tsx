import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Falls back to the phone's last two digits for any account that hasn't
// filled in a name yet — not everyone will have one immediately after
// this shipped (see the schema comment on Account.name).
function initialsFor(name: string | null | undefined, phoneNumber: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    const initials = (first + last).toUpperCase();
    if (initials) return initials;
  }
  const digits = phoneNumber.replace(/\D/g, "");
  return digits.slice(-2) || "?";
}

export function MemberAvatar({
  name,
  phoneNumber,
  size = "default",
  className,
}: {
  name?: string | null;
  phoneNumber: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={cn(className)}>
      <AvatarFallback className="bg-primary/10 font-mono font-medium text-primary">
        {initialsFor(name, phoneNumber)}
      </AvatarFallback>
    </Avatar>
  );
}
