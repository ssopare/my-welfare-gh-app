"use client";

import { useState, useActionState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Globe,
  Loader2,
  MessageSquare,
  Radio,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  SmsGatewaySummary,
  SmsLogItem,
  SmsProviderBalance,
} from "@welfare/shared-types";
import {
  sendTestSmsAction,
  sendBroadcastSmsAction,
  type FormActionState,
} from "./sms-actions";

interface SmsGatewayTabProps {
  summary: SmsGatewaySummary | null;
  logs: SmsLogItem[] | null;
}

export function SmsGatewayTab({ summary, logs }: SmsGatewayTabProps) {
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);

  const [testState, testFormAction, testPending] = useActionState<FormActionState, FormData>(
    async (prev, formData) => {
      const res = await sendTestSmsAction(prev, formData);
      if (res.success) {
        setTimeout(() => setTestModalOpen(false), 2000);
      }
      return res;
    },
    { error: null },
  );

  const [broadcastState, broadcastFormAction, broadcastPending] = useActionState<FormActionState, FormData>(
    async (prev, formData) => {
      const res = await sendBroadcastSmsAction(prev, formData);
      if (res.success) {
        setTimeout(() => setBroadcastModalOpen(false), 2500);
      }
      return res;
    },
    { error: null },
  );

  const providers = summary?.providers ?? [];
  const totalSms = summary?.totalAvailableSms ?? 0;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Summary & Quick Actions Header ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-2xl border border-glass-border bg-gradient-to-br from-indigo-950/40 via-glass-card/40 to-glass-card/20 backdrop-blur-xl p-6 flex flex-col justify-between gap-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Radio className="size-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground tracking-tight">
                  Multi-Tier SMS &amp; OTP Engine
                </h3>
                <p className="text-xs text-muted-foreground">
                  Automatic primary routing with seamless secondary failover.
                </p>
              </div>
            </div>

            <Badge
              variant="outline"
              className={cn(
                "px-3 py-1 text-xs font-semibold uppercase tracking-wider border",
                summary?.isHealthy
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30",
              )}
            >
              {summary?.isHealthy ? "● All Tiers Operational" : "▲ Attention Needed"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-border/50">
            <div>
              <span className="text-xs text-muted-foreground uppercase font-medium">Total SMS Units</span>
              <p className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight tabular-nums mt-0.5">
                {totalSms.toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase font-medium">Primary Route</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-block size-2 rounded-full bg-indigo-400" />
                <span className="font-semibold text-sm text-foreground">
                  {summary?.primaryProvider ?? "ARKESEL"}
                </span>
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-xs text-muted-foreground uppercase font-medium">Failover Backup</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-block size-2 rounded-full bg-emerald-400" />
                <span className="font-semibold text-sm text-foreground">
                  {summary?.fallbackProvider ?? "MNOTIFY"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div className="rounded-2xl border border-glass-border bg-glass-card/40 backdrop-blur-xl p-6 flex flex-col justify-between gap-3 shadow-lg">
          <div>
            <h4 className="text-sm font-bold text-foreground">Quick Gateway Actions</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Test live deliverability or broadcast urgent announcements to members.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* Send Test SMS Modal */}
            <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2 text-xs font-semibold h-10">
                  <Send className="size-3.5 text-indigo-400" />
                  Send Test SMS
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Send className="size-4 text-indigo-500" />
                    Dispatch Test SMS
                  </DialogTitle>
                  <DialogDescription>
                    Send a direct test message to verify real-time routing through the multi-tier pipeline.
                  </DialogDescription>
                </DialogHeader>

                <form action={testFormAction} className="flex flex-col gap-4 mt-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="phoneNumber" className="text-xs font-semibold text-foreground">
                      Recipient Phone Number (Ghana)
                    </label>
                    <input
                      id="phoneNumber"
                      name="phoneNumber"
                      type="text"
                      placeholder="e.g. 0244123456 or 0551234987"
                      required
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="message" className="text-xs font-semibold text-foreground">
                      Test Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={3}
                      defaultValue="Hello from Welfare Platform! Your multi-tier SMS gateway is active and operational."
                      required
                      className="rounded-lg border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>

                  {testState.error && (
                    <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                      <AlertCircle className="size-4 shrink-0" />
                      <span>{testState.error}</span>
                    </div>
                  )}

                  {testState.success && (
                    <div className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-400 flex items-center gap-2 border border-emerald-500/20">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>{testState.message}</span>
                    </div>
                  )}

                  <Button type="submit" disabled={testPending} className="gap-2 mt-1">
                    {testPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {testPending ? "Dispatching..." : "Send Test SMS"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            {/* Broadcast Announcement Modal */}
            <Dialog open={broadcastModalOpen} onOpenChange={setBroadcastModalOpen}>
              <DialogTrigger asChild>
                <Button className="w-full justify-start gap-2 text-xs font-semibold h-10 bg-indigo-600 hover:bg-indigo-700 text-white">
                  <MessageSquare className="size-3.5" />
                  Broadcast to Members
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <MessageSquare className="size-4 text-indigo-500" />
                    Broadcast SMS Announcement
                  </DialogTitle>
                  <DialogDescription>
                    Dispatch a bulk SMS announcement to all verified member phone numbers in this organisation.
                  </DialogDescription>
                </DialogHeader>

                <form action={broadcastFormAction} className="flex flex-col gap-4 mt-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="recipientGroup" className="text-xs font-semibold text-foreground">
                      Target Recipient Group
                    </label>
                    <select
                      id="recipientGroup"
                      name="recipientGroup"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="ACTIVE_MEMBERS">Active Members Only (Good Standing)</option>
                      <option value="ALL_MEMBERS">All Members (Active + Probation + In Arrears)</option>
                      <option value="DEFAULTERS">Defaulters / In-Arrears Members Only</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="broadcastMessage" className="text-xs font-semibold text-foreground">
                      Announcement Text
                    </label>
                    <textarea
                      id="broadcastMessage"
                      name="message"
                      rows={4}
                      placeholder="e.g. Welfare Monthly General Meeting will take place this Sunday at 2:00 PM. Please be punctual."
                      required
                      className="rounded-lg border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>

                  {broadcastState.error && (
                    <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                      <AlertCircle className="size-4 shrink-0" />
                      <span>{broadcastState.error}</span>
                    </div>
                  )}

                  {broadcastState.success && (
                    <div className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-400 flex items-center gap-2 border border-emerald-500/20">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>{broadcastState.message}</span>
                    </div>
                  )}

                  <Button type="submit" disabled={broadcastPending} className="gap-2 mt-1 bg-indigo-600 hover:bg-indigo-700">
                    {broadcastPending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
                    {broadcastPending ? "Broadcasting..." : "Dispatch Broadcast"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* ── Tiered Provider Balance Cards ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-foreground tracking-tight">
              Configured SMS Gateway Tiers
            </h3>
            <p className="text-xs text-muted-foreground">
              Real-time credit balance and status for each gateway tier.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {providers.map((p) => {
            const isPrimary = p.tier === 1;
            const isFallback = p.tier === 2;
            const isEnterprise = p.tier === 3;

            return (
              <Card
                key={p.provider}
                className={cn(
                  "border-glass-border bg-glass-card/40 backdrop-blur-xl transition-all duration-300 hover:shadow-xl relative overflow-hidden",
                  isPrimary && "border-indigo-500/40 bg-gradient-to-b from-indigo-950/20 to-glass-card/40",
                )}
              >
                <div
                  className={cn(
                    "absolute top-0 left-0 right-0 h-1",
                    isPrimary ? "bg-indigo-500" : isFallback ? "bg-emerald-500" : "bg-blue-500",
                  )}
                />

                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-bold tracking-wider uppercase px-2 py-0.5",
                        isPrimary
                          ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-400"
                          : isFallback
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            : "border-blue-500/40 bg-blue-500/10 text-blue-400",
                      )}
                    >
                      {isPrimary ? "Tier 1 · Primary" : isFallback ? "Tier 2 · Fallback" : "Tier 3 · Enterprise"}
                    </Badge>

                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          p.status === "ACTIVE"
                            ? "bg-emerald-400 animate-pulse"
                            : p.status === "UNCONFIGURED"
                              ? "bg-zinc-500"
                              : "bg-amber-400",
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs",
                          p.status === "ACTIVE" ? "text-emerald-400 font-semibold" : "text-muted-foreground",
                        )}
                      >
                        {p.status === "ACTIVE" ? "Connected" : p.status === "UNCONFIGURED" ? "Not Setup" : p.status}
                      </span>
                    </div>
                  </div>

                  <CardTitle className="text-lg font-bold text-foreground mt-2 flex items-center gap-2">
                    {p.displayName}
                  </CardTitle>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1 rounded-xl bg-background/50 p-3.5 border border-border/50">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase">
                      SMS Units Remaining
                    </span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-extrabold text-foreground tabular-nums">
                        {p.isConfigured ? p.smsUnits.toLocaleString() : "—"}
                      </span>
                      {p.mainBalanceValue && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          Wallet: {p.mainBalanceValue}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span>Delivery Target:</span>
                      <span className="font-medium text-foreground">
                        {isPrimary ? "Ghana MTN / Telecel / AT" : isFallback ? "DND Direct Route" : "Enterprise Hub"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Routing Priority:</span>
                      <span className="font-semibold text-foreground">
                        {isPrimary ? "Highest (Default)" : isFallback ? "Secondary (Auto-Failover)" : "Tertiary"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Failover Routing Pipeline Visualization ── */}
      <div className="rounded-2xl border border-glass-border bg-glass-card/30 backdrop-blur-xl p-6">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <Zap className="size-4 text-amber-400" />
          Active Failover Pipeline
        </h4>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1 w-full rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 font-bold text-xs shrink-0">
              1
            </div>
            <div>
              <span className="text-xs font-bold text-foreground">Arkesel (Primary)</span>
              <p className="text-[11px] text-muted-foreground">High-speed OTP &amp; receipts</p>
            </div>
          </div>

          <div className="flex items-center text-muted-foreground shrink-0">
            <ArrowRight className="size-5 hidden md:block" />
            <span className="text-[10px] md:hidden">↓ on failure ↓</span>
          </div>

          <div className="flex-1 w-full rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs shrink-0">
              2
            </div>
            <div>
              <span className="text-xs font-bold text-foreground">mNotify (Fallback)</span>
              <p className="text-[11px] text-muted-foreground">Instant backup dispatch</p>
            </div>
          </div>

          <div className="flex items-center text-muted-foreground shrink-0">
            <ArrowRight className="size-5 hidden md:block" />
            <span className="text-[10px] md:hidden">↓ on failure ↓</span>
          </div>

          <div className="flex-1 w-full rounded-xl border border-blue-500/30 bg-blue-950/20 p-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 font-bold text-xs shrink-0">
              3
            </div>
            <div>
              <span className="text-xs font-bold text-foreground">Hubtel (Enterprise)</span>
              <p className="text-[11px] text-muted-foreground">Heavy-duty reserve route</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Live SMS Delivery Logs Table ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-foreground tracking-tight">
              Recent SMS Delivery Logs
            </h3>
            <p className="text-xs text-muted-foreground">
              Audit trail of dispatches with exact provider attribution.
            </p>
          </div>
        </div>

        {!logs || logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
            <MessageSquare className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No SMS messages dispatched yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-glass-border bg-glass-card/40 backdrop-blur-xl shadow-lg">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Time</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Message Excerpt</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dispatched Via</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("en-GH", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground font-semibold">
                      {log.phoneNumber}
                    </TableCell>
                    <TableCell className="text-xs text-foreground/90 max-w-xs truncate">
                      {log.messageExcerpt}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 uppercase tracking-wide">
                        {log.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 uppercase border-none",
                          log.provider === "ARKESEL"
                            ? "bg-indigo-500/20 text-indigo-400"
                            : log.provider === "MNOTIFY"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : log.provider === "HUBTEL"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-zinc-500/20 text-zinc-400",
                        )}
                      >
                        {log.provider}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5",
                          log.status === "DELIVERED" || log.status === "SENT"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-destructive/10 text-destructive border-destructive/30",
                        )}
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
