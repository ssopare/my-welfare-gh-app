import { StatusBadge, type StatusTone } from "@/components/finance/status-badge";

interface StatusGuideItem {
  tone: StatusTone;
  label: string;
  description: string;
}

// A one-time explainer for what each status chip actually means, next to
// wherever those chips first appear — the chip vocabulary itself
// (Paid/Overdue/etc.) is self-explanatory to a treasurer who lives in
// this system daily, but not necessarily to a newer admin still learning
// it. Cheap to add, no backend involved.
export function StatusGuide({ items }: { items: StatusGuideItem[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Status guide</p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-2.5">
            <StatusBadge tone={item.tone} label={item.label} className="mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
