"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// A one-off, no-arguments server action wired directly to a button — for
// actions low-risk enough not to need a full confirmation dialog (e.g.
// activating a draft rule, resolving a reconciliation exception already
// reviewed). A toast on failure is enough; success is self-evident from
// the row updating after revalidation.
export function AsyncActionButton({
  action,
  label,
  variant = "outline",
}: {
  action: () => Promise<void>;
  label: string;
  variant?: "outline" | "destructive";
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className="print:hidden"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          try {
            await action();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Something went wrong.");
          }
        });
      }}
    >
      {label}
    </Button>
  );
}
