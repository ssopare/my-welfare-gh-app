"use client";

import { useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkApproveMembersAction } from "@/app/(app)/members/actions";

interface BulkApproveMembersButtonProps {
  memberIds: string[];
}

export function BulkApproveMembersButton({ memberIds }: BulkApproveMembersButtonProps) {
  const [isPending, startTransition] = useTransition();

  if (memberIds.length === 0) return null;

  function handleBulkApprove() {
    startTransition(async () => {
      try {
        const { successCount, errorCount } = await bulkApproveMembersAction(memberIds);
        if (successCount > 0) {
          toast.success(`Successfully approved ${successCount} member(s).`);
        }
        if (errorCount > 0) {
          toast.error(`Failed to approve ${errorCount} member(s).`);
        }
      } catch (err) {
        toast.error("Failed to complete bulk approval.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      className="gap-2 bg-status-good hover:bg-status-good/90 text-white font-medium"
      onClick={handleBulkApprove}
      disabled={isPending}
    >
      {isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Approving {memberIds.length}...
        </>
      ) : (
        <>
          <CheckCheck className="size-4" />
          Approve all pending ({memberIds.length})
        </>
      )}
    </Button>
  );
}
