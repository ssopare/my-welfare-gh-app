"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  HandCoins,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Search,
  Sparkles,
  TrendingUp,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Screen = "overview" | "claims" | "member" | "ledger";

const screens: { id: Screen; label: string; short: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Executive overview", short: "Overview", icon: LayoutDashboard },
  { id: "claims", label: "Claim review", short: "Claims", icon: HandCoins },
  { id: "member", label: "Member profile", short: "Member", icon: UserRound },
  { id: "ledger", label: "Fund & ledger", short: "Ledger", icon: WalletCards },
];

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-800",
        tone === "bad" && "border-rose-200 bg-rose-50 text-rose-800",
        tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      {children}
    </span>
  );
}

function Metric({ label, value, note, icon, positive }: { label: string; value: string; note: string; icon: ReactNode; positive?: boolean }) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-[0.13em]">{label}</span>
        <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span>
      </div>
      <p className="mt-5 text-2xl font-bold tracking-tight text-slate-950 tabular-nums sm:text-3xl">{value}</p>
      <p className={cn("mt-2 flex items-center gap-1.5 text-xs", positive ? "text-emerald-700" : "text-slate-500")}>
        {positive && <ArrowUpRight className="size-3.5" />}{note}
      </p>
    </article>
  );
}

function Overview() {
  const months = [58, 68, 64, 76, 72, 85, 92, 88, 96];
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[1.4rem] bg-[#073f35] p-5 text-white shadow-[0_18px_45px_rgba(6,78,59,0.2)] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-200">Good morning, Ama</p>
            <h1 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">Your welfare fund is healthy and on track.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/75">A clear view of contributions, claims and members requiring attention.</p>
          </div>
          <button className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-white px-4 text-sm font-semibold text-emerald-950 shadow-sm">
            <Download className="size-4" /> Export report
          </button>
        </div>
        <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/15 pt-5 text-xs text-emerald-100/70">
          <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-300" />All systems operational</span>
          <span>Last reconciled today, 08:42</span>
          <span>FY 2026 · Quarter 3</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Fund balance" value="GH₵ 428.6k" note="12.4% from last quarter" positive icon={<WalletCards className="size-4" />} />
        <Metric label="Collection rate" value="94.2%" note="Target is 90%" positive icon={<TrendingUp className="size-4" />} />
        <Metric label="Active members" value="1,248" note="18 joined this month" icon={<UsersRound className="size-4" />} />
        <Metric label="Open claims" value="12" note="3 require attention" icon={<HandCoins className="size-4" />} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between">
            <div><h2 className="font-semibold text-slate-950">Contribution performance</h2><p className="mt-1 text-xs text-slate-500">Expected versus collected · 2026</p></div>
            <button className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600">This year <ChevronDown className="size-3.5" /></button>
          </div>
          <div className="mt-7 flex h-48 items-end gap-2 border-b border-slate-200 sm:gap-4">
            {months.map((height, index) => (
              <div key={index} className="group flex h-full flex-1 items-end justify-center gap-1">
                <div className="w-[42%] rounded-t-md bg-emerald-100" style={{ height: `${Math.min(height + 7, 100)}%` }} />
                <div className="w-[42%] rounded-t-md bg-emerald-600 transition-colors group-hover:bg-emerald-700" style={{ height: `${height}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-slate-400"><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span></div>
          <div className="mt-5 flex gap-5 text-xs text-slate-600"><span className="flex items-center gap-2"><i className="size-2.5 rounded-sm bg-emerald-600" />Collected</span><span className="flex items-center gap-2"><i className="size-2.5 rounded-sm bg-emerald-100" />Expected</span></div>
        </article>

        <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-semibold text-slate-950">Needs attention</h2><p className="mt-1 text-xs text-slate-500">Prioritised by urgency</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">5</span></div>
          <div className="divide-y divide-slate-100">
            {[
              ["3 claims awaiting decision", "Oldest is 4 days", "warn"],
              ["Reconciliation variance", "GH₵ 1,240 unmatched", "bad"],
              ["7 members entering grace", "Review by 14 Aug", "neutral"],
            ].map(([title, note, tone]) => (
              <button key={title} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50">
                <span className={cn("size-2.5 rounded-full", tone === "warn" && "bg-amber-500", tone === "bad" && "bg-rose-500", tone === "neutral" && "bg-slate-400")} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{title}</span><span className="mt-0.5 block text-xs text-slate-500">{note}</span></span>
                <ChevronRight className="size-4 text-slate-400" />
              </button>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function Claims() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3"><button className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white"><ArrowLeft className="size-4" /></button><div><p className="text-xs font-medium text-emerald-700">Claims / CLM-2026-0048</p><h1 className="text-2xl font-bold tracking-tight text-slate-950">Birth benefit claim</h1></div></div>
      <div className="grid gap-4 xl:grid-cols-[1fr_350px]">
        <div className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-full bg-[#e9c9a8] text-sm font-bold text-[#59371f]">EA</span><div><h2 className="font-semibold text-slate-950">Esi Agyeman</h2><p className="text-xs text-slate-500">Member #MW-0184 · Good standing</p></div></div>
              <StatusPill tone="warn"><Clock3 className="size-3" /> Awaiting decision</StatusPill>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-5 border-y border-slate-100 py-5 sm:grid-cols-4">
              {[['Submitted','7 Aug 2026'],['Benefit','Birth support'],['Claim amount','GH₵ 2,500'],['SLA remaining','1d 18h']].map(([a,b])=><div key={a}><dt className="text-xs text-slate-500">{a}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{b}</dd></div>)}
            </dl>
            <h3 className="mt-6 text-sm font-semibold text-slate-950">Claim narrative</h3><p className="mt-2 text-sm leading-6 text-slate-600">Benefit request following the birth of the member&apos;s child on 2 August 2026. Hospital documentation and birth record have been provided.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold">Evidence</h2><p className="mt-1 text-xs text-slate-500">2 files provided by the member</p></div><StatusPill tone="good"><Check className="size-3" /> Complete</StatusPill></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">{[['Birth certificate','PDF · 1.2 MB'],['Hospital discharge note','PDF · 840 KB']].map(([a,b])=><button key={a} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-emerald-300 hover:bg-emerald-50/40"><span className="grid size-10 place-items-center rounded-lg bg-rose-50 text-rose-600"><FileText className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{a}</span><span className="text-xs text-slate-500">{b}</span></span><ChevronRight className="size-4 text-slate-400" /></button>)}</div>
          </article>
        </div>
        <aside className="space-y-4">
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex items-center gap-2 text-emerald-800"><Sparkles className="size-4" /><h2 className="text-sm font-bold">Eligibility explanation</h2></div>
            <p className="mt-3 text-sm leading-6 text-slate-700">This claim meets all configured conditions for the active Birth Support rule.</p>
            <div className="mt-4 space-y-3">{['Member for 28 months (min. 12)','No contribution arrears','Evidence requirements met','No prior birth claim this year'].map(x=><div key={x} className="flex gap-2 text-xs text-slate-700"><span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check className="size-2.5" /></span>{x}</div>)}</div>
            <p className="mt-4 rounded-lg bg-white/70 p-3 text-[11px] leading-5 text-slate-500"><b className="text-slate-700">Human decision required.</b> This explanation is generated from approved rules and does not approve the claim.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-semibold">Decision</h2><textarea aria-label="Decision note" placeholder="Add a decision note…" className="mt-3 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-emerald-500" /><div className="mt-3 grid grid-cols-2 gap-2"><button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 font-semibold text-rose-700"><X className="size-4" />Decline</button><button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 font-semibold text-white"><Check className="size-4" />Approve</button></div></article>
        </aside>
      </div>
    </div>
  );
}

function Member() {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid size-20 place-items-center rounded-2xl bg-[#e9c9a8] text-xl font-bold text-[#59371f]">EA</div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">Esi Agyeman</h1><StatusPill tone="good"><BadgeCheck className="size-3" /> Good standing</StatusPill></div><p className="mt-1 text-sm text-slate-500">MW-0184 · Joined 12 April 2024 · Accra campus</p><div className="mt-4 flex flex-wrap gap-2"><StatusPill>Staff member</StatusPill><StatusPill>Tier A benefits</StatusPill><StatusPill>Monthly contributor</StatusPill></div></div>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold"><MoreHorizontal className="size-4" /> Manage</button>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Contributed" value="GH₵ 9,600" note="Lifetime total" icon={<ArrowDownRight className="size-4" />} /><Metric label="Benefits" value="GH₵ 0" note="No disbursements" icon={<ArrowUpRight className="size-4" />} /><Metric label="Consistency" value="100%" note="Excellent record" positive icon={<TrendingUp className="size-4" />} /><Metric label="Balance due" value="GH₵ 0" note="Fully paid" positive icon={<CircleDollarSign className="size-4" />} /></section>
          <article className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-semibold">Contribution statement</h2><p className="mt-1 text-xs text-slate-500">Recent obligations and payments</p></div><button className="text-xs font-semibold text-emerald-700">View full statement</button></div><div className="divide-y divide-slate-100">{[['August contribution','8 Aug 2026','GH₵ 400','Paid'],['July contribution','9 Jul 2026','GH₵ 400','Paid'],['June contribution','7 Jun 2026','GH₵ 400','Paid'],['Special levy · AGM','3 Jun 2026','GH₵ 200','Paid']].map(([a,b,c,d])=><div key={a} className="grid grid-cols-[1fr_auto] items-center gap-3 p-4 sm:grid-cols-[1fr_120px_100px_auto]"><div><p className="text-sm font-semibold">{a}</p><p className="mt-0.5 text-xs text-slate-500 sm:hidden">{b}</p></div><p className="hidden text-xs text-slate-500 sm:block">{b}</p><p className="text-right text-sm font-bold tabular-nums">{c}</p><StatusPill tone="good">{d}</StatusPill></div>)}</div></article>
        </div>
        <aside className="space-y-4"><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Eligibility snapshot</h2><div className="mt-5 flex justify-center"><div className="grid size-36 place-items-center rounded-full bg-[conic-gradient(#059669_0_100%,#e2e8f0_100%)] p-2"><div className="grid size-full place-items-center rounded-full bg-white text-center"><span><b className="block text-3xl">100</b><small className="text-slate-500">score</small></span></div></div></div><p className="mt-4 text-center text-sm font-semibold text-emerald-700">Eligible for all Tier A benefits</p></article><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Contact details</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-xs text-slate-500">Phone</dt><dd className="mt-1 font-medium">+233 24 555 0184</dd></div><div><dt className="text-xs text-slate-500">Email</dt><dd className="mt-1 break-all font-medium">esi.agyeman@example.org</dd></div><div><dt className="text-xs text-slate-500">Next of kin</dt><dd className="mt-1 font-medium">Kofi Agyeman · Spouse</dd></div></dl></article></aside>
      </div>
    </div>
  );
}

function Ledger() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Finance</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Fund & ledger</h1><p className="mt-1 text-sm text-slate-500">A complete, auditable view of money in and money out.</p></div><div className="flex gap-2"><button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold">Reconcile</button><button className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white">Record payment</button></div></div>
      <section className="grid gap-3 sm:grid-cols-3"><Metric label="Available balance" value="GH₵ 428,640" note="Across 3 active funds" positive icon={<WalletCards className="size-4" />} /><Metric label="Money in · August" value="GH₵ 82,400" note="94.2% collection rate" positive icon={<ArrowDownRight className="size-4" />} /><Metric label="Money out · August" value="GH₵ 31,750" note="14 approved disbursements" icon={<ArrowUpRight className="size-4" />} /></section>
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Recent journal entries</h2><p className="mt-1 text-xs text-slate-500">Double-entry records · immutable audit trail</p></div><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search journal" placeholder="Search reference…" className="h-9 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm sm:w-56" /></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Reference','Description','Fund','Date','Amount','Status'].map(x=><th key={x} className="px-5 py-3 font-semibold">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 text-sm">{[
          ['JRN-240821','Monthly contributions · batch','General welfare','10 Aug','+ GH₵ 18,400','Posted','good'],
          ['JRN-240820','Birth benefit · E. Agyeman','Benefits fund','09 Aug','− GH₵ 2,500','Pending','warn'],
          ['JRN-240819','Bank charge · July','Operations','08 Aug','− GH₵ 120','Posted','good'],
          ['JRN-240818','Arrears collection · batch','General welfare','07 Aug','+ GH₵ 6,800','Posted','good'],
        ].map(([ref,desc,fund,date,amount,status,tone])=><tr key={ref} className="hover:bg-slate-50"><td className="px-5 py-4 font-mono text-xs font-semibold text-emerald-700">{ref}</td><td className="px-5 py-4 font-medium">{desc}</td><td className="px-5 py-4 text-slate-500">{fund}</td><td className="px-5 py-4 text-slate-500">{date}</td><td className={cn("px-5 py-4 text-right font-bold tabular-nums",amount.startsWith('+')?'text-emerald-700':'text-slate-800')}>{amount}</td><td className="px-5 py-4"><StatusPill tone={tone as 'good'|'warn'}>{status}</StatusPill></td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between border-t border-slate-100 p-4 text-xs text-slate-500"><span>Showing 4 of 1,284 entries</span><button className="font-semibold text-emerald-700">View all entries →</button></div>
      </section>
    </div>
  );
}

export default function UiPreviewPage() {
  const [screen, setScreen] = useState<Screen>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const ScreenContent = screen === "overview" ? Overview : screen === "claims" ? Claims : screen === "member" ? Member : Ledger;
  return (
    <div className="min-h-screen bg-[#f6f7f4] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-emerald-900/70 bg-[#062f29] text-white lg:flex lg:flex-col">
          <div className="flex h-20 items-center gap-3 px-6"><span className="grid size-10 place-items-center rounded-xl bg-emerald-400 font-black text-emerald-950">W</span><div><p className="font-bold tracking-tight">WelfareOne</p><p className="text-[10px] uppercase tracking-[0.15em] text-emerald-200/60">Admin workspace</p></div></div>
          <div className="mx-4 rounded-xl border border-white/10 bg-white/[0.06] p-3"><p className="truncate text-sm font-semibold">Unity Staff Welfare</p><p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-200/65"><span className="size-1.5 rounded-full bg-emerald-400" />Organisation active</p></div>
          <nav className="mt-6 flex-1 space-y-1 px-3" aria-label="Preview screens">{screens.map(item=><button key={item.id} onClick={()=>setScreen(item.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition",screen===item.id?"bg-emerald-400 text-emerald-950 shadow-lg shadow-black/10":"text-emerald-50/70 hover:bg-white/[0.07] hover:text-white")}><item.icon className="size-4" />{item.label}</button>)}</nav>
          <div className="m-4 rounded-xl border border-white/10 p-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-amber-200 text-xs font-bold text-amber-950">AA</span><div className="min-w-0"><p className="truncate text-sm font-semibold">Ama Asante</p><p className="text-[11px] text-emerald-100/60">Administrator</p></div></div></div>
        </aside>

        {mobileMenu && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={()=>setMobileMenu(false)} />}
        <aside className={cn("fixed inset-y-0 left-0 z-50 w-[82vw] max-w-xs bg-[#062f29] p-4 text-white transition-transform lg:hidden",mobileMenu?"translate-x-0":"-translate-x-full")}><div className="mb-8 flex items-center justify-between"><span className="font-bold">WelfareOne</span><button onClick={()=>setMobileMenu(false)} className="grid size-9 place-items-center rounded-lg bg-white/10"><X className="size-4" /></button></div><nav className="space-y-2">{screens.map(item=><button key={item.id} onClick={()=>{setScreen(item.id);setMobileMenu(false)}} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium",screen===item.id?"bg-emerald-400 text-emerald-950":"text-emerald-50/70")}><item.icon className="size-4" />{item.label}</button>)}</nav></aside>

        <div className="min-w-0 flex-1 lg:pl-64">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-[#f6f7f4]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8"><button onClick={()=>setMobileMenu(true)} className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white lg:hidden"><Menu className="size-4" /></button><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{screens.find(x=>x.id===screen)?.label}</p><p className="hidden text-[11px] text-slate-500 sm:block">UI concept · Sample data</p></div><button aria-label="Notifications" className="relative grid size-9 place-items-center rounded-xl border border-slate-200 bg-white"><Bell className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500" /></button><button className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-2 pr-3 text-xs font-semibold sm:flex"><span className="grid size-7 place-items-center rounded-lg bg-amber-200 text-[10px]">AA</span>Ama <ChevronDown className="size-3" /></button></header>
          <main className="mx-auto max-w-[1500px] p-4 pb-24 sm:p-6 lg:p-8"><ScreenContent /></main>
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Mobile navigation">{screens.map(item=><button key={item.id} onClick={()=>setScreen(item.id)} className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold",screen===item.id?"text-emerald-700":"text-slate-400")}><item.icon className="size-5" />{item.short}</button>)}</nav>
        </div>
      </div>
    </div>
  );
}
