import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchOrNull } from "@/lib/api-client";
import { requireSession } from "@/lib/session";
import type { ReconciliationException } from "@welfare/shared-types";
import { AsyncActionButton } from "@/components/ui/async-action-button";
import { resolveReconciliationExceptionAction } from "../actions";

export const metadata: Metadata = {
  title: "Reconciliation — Welfare Platform",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ReconciliationPage() {
  const { token } = await requireSession();
  const exceptions = await apiFetchOrNull<ReconciliationException[]>("/reconciliation-exceptions", {
    token,
    cache: "no-store",
  });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/ledger" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to ledger
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Payment provider webhooks that couldn&apos;t be matched or confirmed automatically.
        </p>
      </div>

      <Card className="border-border/50 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-status-warn" aria-hidden />
            Unresolved exceptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!exceptions ? (
            <p className="py-10 text-center text-sm text-muted-foreground">You don&apos;t have access to reconciliation.</p>
          ) : exceptions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing to reconcile — every payment webhook has matched cleanly.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {exceptions.map((exception) => (
                <li key={exception.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{exception.reason}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      Ref: {exception.providerReference} · {formatDateTime(exception.createdAt)}
                    </p>
                  </div>
                  <AsyncActionButton
                    label="Mark resolved"
                    action={resolveReconciliationExceptionAction.bind(null, exception.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
