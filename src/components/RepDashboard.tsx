/**
 * RepDashboard.tsx — Full-screen rep performance dashboard
 *
 * Displays KPI cards, progress vs targets, deal performance,
 * training stats, DRAPS funnel, and activity feed for the current rep.
 */

import React, { useMemo, useState } from "react";
import {
  Phone,
  Calendar,
  TrendingUp,
  DollarSign,
  BookOpen,
  Target,
  ArrowUp,
  ArrowDown,
  Minus,
  Eye,
  Activity,
  BarChart2,
  CheckCircle2,
  Clock,
  ChevronRight,
  Award,
  Flame,
} from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useTrainingSessions } from "../hooks/useTrainingSessions";
import { useAppSettings } from "../hooks/useAppSettings";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split("T")[0];

const WEEK_MS = 7 * 86_400_000;
const weekStart = Date.now() - WEEK_MS;

const fmt$ = (n: number) => "$" + n.toLocaleString("en-AU");

const SKILL_LABELS: Record<string, string> = {
  opening: "Opening",
  rapport: "Rapport",
  qualification: "Qualification",
  valueDelivery: "Value Delivery",
  closing: "Closing",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  hard: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const RESULT_COLORS: Record<string, string> = {
  connected: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  booked: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  callback: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  no_answer: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  not_interested: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  wrong_number: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};

const resultLabel = (r: string) => r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const trendDir = (now: number, prev: number): "up" | "down" | "flat" =>
  now > prev ? "up" : now < prev ? "down" : "flat";

const funnelConv = (from: number, to: number): number | null => (from > 0 ? (to / from) * 100 : null);

// ─── Sub-components ───────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "flat" | null;
  trendLabel?: string;
  accent?: string;
}

function KPICard({ label, value, icon, trend, trendLabel, accent = "indigo" }: KPICardProps) {
  const accentMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
    green: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
  };

  const TrendIcon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;

  const trendColor =
    trend === "up"
      ? "text-green-600 dark:text-green-400"
      : trend === "down"
        ? "text-red-500 dark:text-red-400"
        : "text-slate-400";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between">
        <div className={`rounded-lg p-2 ${accentMap[accent] ?? accentMap.indigo}`}>{icon}</div>
        {trend !== null && trend !== undefined && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            {trendLabel ?? ""}
          </div>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
        {typeof value === "number" ? value.toLocaleString("en-AU") : value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

interface ProgressBarProps {
  label: string;
  value: number;
  target: number;
  color?: string;
}

function ProgressBar({ label, value, target, color = "indigo" }: ProgressBarProps) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;

  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className="text-slate-500 dark:text-slate-400">
          {value} / {target}
          <span className="ml-1 text-xs text-slate-400">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorMap[color] ?? colorMap.indigo}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface SkillBarProps {
  label: string;
  value: number;
  max?: number;
  isWeakest?: boolean;
}

function SkillBar({ label, value, max = 10, isWeakest = false }: SkillBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const barColor = isWeakest ? (value < 5 ? "bg-red-500" : "bg-amber-500") : "bg-indigo-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span
          className={`font-medium ${
            isWeakest ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200"
          }`}
        >
          {label}
          {isWeakest && <span className="ml-1 text-xs font-normal text-red-500">(focus area)</span>}
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          {value.toFixed(1)} / {max}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface FunnelStepProps {
  label: string;
  sublabel: string;
  count: number;
  conversionPct?: number | null;
  isLast?: boolean;
}

function FunnelStep({ label, sublabel, count, conversionPct, isLast }: FunnelStepProps) {
  return (
    <div className="flex flex-1 items-center">
      <div className="flex flex-1 flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md">
          <span className="text-xl font-bold">{count}</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{sublabel}</p>
      </div>
      {!isLast && (
        <div className="flex flex-col items-center px-1">
          <ChevronRight className="h-5 w-5 text-slate-400" />
          {conversionPct !== null && conversionPct !== undefined && (
            <span className="text-[10px] font-medium text-slate-400">{conversionPct.toFixed(0)}%</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RepDashboard() {
  // ── Store + hooks (all unconditional) ────────────────────────────────────────
  const { leads, currentUser, settings, drapsEntries, commissions } = useAppStore();
  const { sessions } = useTrainingSessions(currentUser ? currentUser.id : null);
  const { config } = useAppSettings();

  const [_tab, _setTab] = useState<"overview" | "training">("overview"); // reserved for future tab navigation

  // repId — safe 0 sentinel when no user; memos will produce zeroes and be
  // discarded because the component returns early when currentUser is null.
  const repId = currentUser?.id ?? 0;

  // ── Derived dates ────────────────────────────────────────────────────────────

  const today = useMemo(() => todayStr(), []);

  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }, []);

  // ── Rep targets ──────────────────────────────────────────────────────────────

  const repTarget = useMemo(() => settings.repTargets?.[repId] ?? {}, [settings.repTargets, repId]);

  const weeklyDQTarget = repTarget.weeklyDQ ?? 20;
  const weeklyBookingsTarget = repTarget.weeklyBookings ?? 5;
  const weeklyTrainingTarget = config.trainingSettings.weeklyTargetSessions;
  const dailyCallTarget = Math.ceil(weeklyDQTarget / 5);
  const dailyBookingsTarget = Math.ceil(weeklyBookingsTarget / 5);

  // ── Calls today / yesterday ──────────────────────────────────────────────────

  const callsTodayCount = useMemo(() => {
    let count = 0;
    for (const lead of leads) {
      if (!lead.callHistory) continue;
      for (const call of lead.callHistory) {
        if (call.repId === repId && call.date === today) count++;
      }
    }
    return count;
  }, [leads, repId, today]);

  const callsYesterdayCount = useMemo(() => {
    let count = 0;
    for (const lead of leads) {
      if (!lead.callHistory) continue;
      for (const call of lead.callHistory) {
        if (call.repId === repId && call.date === yesterdayStr) count++;
      }
    }
    return count;
  }, [leads, repId, yesterdayStr]);

  // ── Appointments today / yesterday ───────────────────────────────────────────

  const apptsTodayCount = useMemo(() => {
    let count = 0;
    for (const lead of leads) {
      const fcMatch = lead.fcAppt?.repId === repId && lead.fcAppt?.date === today;
      const frMatch = lead.frAppt?.repId === repId && lead.frAppt?.date === today;
      if (fcMatch || frMatch) count++;
    }
    return count;
  }, [leads, repId, today]);

  const apptsYesterdayCount = useMemo(() => {
    let count = 0;
    for (const lead of leads) {
      const fcMatch = lead.fcAppt?.repId === repId && lead.fcAppt?.date === yesterdayStr;
      const frMatch = lead.frAppt?.repId === repId && lead.frAppt?.date === yesterdayStr;
      if (fcMatch || frMatch) count++;
    }
    return count;
  }, [leads, repId, yesterdayStr]);

  // ── Leads created today ───────────────────────────────────────────────────────

  const dealsCreatedToday = useMemo(
    () => leads.filter((l) => l.dqRep === repId && l.leadDate === today).length,
    [leads, repId, today],
  );

  // ── Active deals ─────────────────────────────────────────────────────────────

  const activeDeals = useMemo(() => leads.filter((l) => l.dqRep === repId && !!l.dealId), [leads, repId]);

  const pipelineValue = useMemo(() => activeDeals.reduce((sum, l) => sum + (l.dealValue ?? 0), 0), [activeDeals]);

  // ── My commission allocations ─────────────────────────────────────────────────

  const myCommissions = useMemo(
    () =>
      commissions.flatMap((c) =>
        c.repAllocations
          .filter((a) => a.repId === repId)
          .map((a) => ({
            ...a,
            settlementDate: c.settlementDate,
            commissionId: c.id,
          })),
      ),
    [commissions, repId],
  );

  const commissionsToday = useMemo(
    () => myCommissions.filter((a) => a.settlementDate === today),
    [myCommissions, today],
  );

  const commissionTodayTotal = useMemo(
    () => commissionsToday.reduce((sum, a) => sum + (a.amount ?? 0), 0),
    [commissionsToday],
  );

  const settledToday = useMemo(() => new Set(commissionsToday.map((a) => a.commissionId)).size, [commissionsToday]);

  const commissionPaid = useMemo(
    () => myCommissions.filter((a) => a.paid).reduce((s, a) => s + a.amount, 0),
    [myCommissions],
  );

  const commissionPending = useMemo(
    () => myCommissions.filter((a) => !a.paid).reduce((s, a) => s + a.amount, 0),
    [myCommissions],
  );

  // ── Commission this week ──────────────────────────────────────────────────────

  const commissionThisWeek = useMemo(
    () =>
      commissions
        .filter((c) => c.settlementDate && new Date(c.settlementDate).getTime() >= weekStart)
        .flatMap((c) => c.repAllocations.filter((a) => a.repId === repId).map((a) => a.amount))
        .reduce((s, v) => s + v, 0),
    [commissions, repId],
  );

  // ── Training this week ────────────────────────────────────────────────────────

  const trainingThisWeekCount = useMemo(
    () => sessions.filter((s) => s.completedAt >= weekStart && !s.partial).length,
    [sessions],
  );

  // ── Calls this week ───────────────────────────────────────────────────────────

  const callsThisWeek = useMemo(() => {
    const ws = new Date(weekStart);
    let count = 0;
    for (const lead of leads) {
      if (!lead.callHistory) continue;
      for (const call of lead.callHistory) {
        if (call.repId !== repId) continue;
        if (call.date && new Date(call.date) >= ws) count++;
      }
    }
    return count;
  }, [leads, repId]);

  // ── Appointments this week ────────────────────────────────────────────────────

  const apptsThisWeek = useMemo(() => {
    const ws = new Date(weekStart);
    let count = 0;
    for (const lead of leads) {
      const fcDate = lead.fcAppt?.date;
      const frDate = lead.frAppt?.date;
      const fcMatch = lead.fcAppt?.repId === repId && fcDate && new Date(fcDate) >= ws;
      const frMatch = lead.frAppt?.repId === repId && frDate && new Date(frDate) >= ws;
      if (fcMatch || frMatch) count++;
    }
    return count;
  }, [leads, repId]);

  // ── Last 5 completed training sessions ───────────────────────────────────────

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .filter((s) => !s.partial)
        .sort((a, b) => b.completedAt - a.completedAt)
        .slice(0, 5),
    [sessions],
  );

  // ── Skill averages over last 10 sessions with sectionScores ──────────────────

  const skillAverages = useMemo(() => {
    const last10 = [...sessions]
      .filter((s) => !s.partial && !!s.sectionScores)
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, 10);

    const zero = {
      opening: 0,
      rapport: 0,
      qualification: 0,
      valueDelivery: 0,
      closing: 0,
    };

    if (last10.length === 0) return zero;

    const keys = ["opening", "rapport", "qualification", "valueDelivery", "closing"] as const;

    const sums = { ...zero };
    for (const s of last10) {
      for (const k of keys) {
        sums[k] += s.sectionScores?.[k] ?? 0;
      }
    }

    return {
      opening: sums.opening / last10.length,
      rapport: sums.rapport / last10.length,
      qualification: sums.qualification / last10.length,
      valueDelivery: sums.valueDelivery / last10.length,
      closing: sums.closing / last10.length,
    };
  }, [sessions]);

  const weakestSkill = useMemo(() => {
    const entries = Object.entries(skillAverages) as [string, number][];
    if (entries.every(([, v]) => v === 0)) return null;
    return entries.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  }, [skillAverages]);

  // ── DRAPS today ───────────────────────────────────────────────────────────────

  const drapsToday = useMemo(
    () => drapsEntries.find((e) => e.repId === repId && e.date === today) ?? null,
    [drapsEntries, repId, today],
  );

  // ── Activity feed (last 10 calls for this rep across all leads) ───────────────

  const activityFeed = useMemo(() => {
    const items: Array<{
      leadName: string;
      date: string;
      time: string;
      result: string;
      notes: string;
    }> = [];

    for (const lead of leads) {
      if (!lead.callHistory) continue;
      for (const call of lead.callHistory) {
        if (call.repId !== repId) continue;
        items.push({
          leadName: lead.name,
          date: call.date,
          time: call.time,
          result: call.result,
          notes: call.notes,
        });
      }
    }

    return items
      .sort((a, b) => {
        const aTs = new Date(`${a.date}T${a.time || "00:00"}`).getTime();
        const bTs = new Date(`${b.date}T${b.time || "00:00"}`).getTime();
        return bTs - aTs;
      })
      .slice(0, 10);
  }, [leads, repId]);

  // ── Guard: no logged-in user ──────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-slate-500 dark:text-slate-400">No user selected. Please log in.</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 dark:bg-slate-900 sm:p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Welcome back, <span className="font-medium text-indigo-600 dark:text-indigo-400">{currentUser.name}</span>{" "}
            &middot;{" "}
            {new Date().toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          Live
        </span>
      </div>

      {/* ── ROW 1: KPI Cards ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Today at a Glance
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KPICard
            label="Calls Today"
            value={callsTodayCount}
            icon={<Phone className="h-4 w-4" />}
            accent="indigo"
            trend={trendDir(callsTodayCount, callsYesterdayCount)}
            trendLabel={`${callsYesterdayCount} yesterday`}
          />
          <KPICard
            label="Appointments Today"
            value={apptsTodayCount}
            icon={<Calendar className="h-4 w-4" />}
            accent="blue"
            trend={trendDir(apptsTodayCount, apptsYesterdayCount)}
            trendLabel={`${apptsYesterdayCount} yesterday`}
          />
          <KPICard
            label="Leads Created Today"
            value={dealsCreatedToday}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="green"
            trend={null}
          />
          <KPICard
            label="Deals Settled Today"
            value={settledToday}
            icon={<CheckCircle2 className="h-4 w-4" />}
            accent="amber"
            trend={null}
          />
          <KPICard
            label="Commission Today"
            value={fmt$(commissionTodayTotal)}
            icon={<DollarSign className="h-4 w-4" />}
            accent="rose"
            trend={null}
          />
          <KPICard
            label="Training This Week"
            value={trainingThisWeekCount}
            icon={<BookOpen className="h-4 w-4" />}
            accent="purple"
            trend={trainingThisWeekCount >= weeklyTrainingTarget ? "up" : "flat"}
            trendLabel={`target ${weeklyTrainingTarget}`}
          />
        </div>
      </section>

      {/* ── ROW 2: Progress vs Targets + Weekly Summary ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Progress bars */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-500" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Progress vs Targets</h2>
          </div>
          <div className="space-y-5">
            <ProgressBar label="Calls (daily target)" value={callsTodayCount} target={dailyCallTarget} color="indigo" />
            <ProgressBar
              label="Appointments (daily target)"
              value={apptsTodayCount}
              target={dailyBookingsTarget}
              color="blue"
            />
            <ProgressBar
              label="Training Sessions (weekly target)"
              value={trainingThisWeekCount}
              target={weeklyTrainingTarget}
              color="green"
            />
          </div>
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            Calls &amp; appointments show daily targets (weekly ÷ 5). Training shows weekly target.
          </p>
        </div>

        {/* Weekly summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-indigo-500" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">This Week</h2>
            <span className="ml-auto text-xs text-slate-400">Rolling 7 days</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                label: "Calls",
                value: callsThisWeek,
                icon: <Phone className="h-4 w-4" />,
              },
              {
                label: "Appointments",
                value: apptsThisWeek,
                icon: <Calendar className="h-4 w-4" />,
              },
              {
                label: "Training Sessions",
                value: trainingThisWeekCount,
                icon: <BookOpen className="h-4 w-4" />,
              },
              {
                label: "Commission",
                value: fmt$(commissionThisWeek),
                icon: <DollarSign className="h-4 w-4" />,
              },
            ].map(({ label, value, icon }) => (
              <div key={label} className="flex flex-col rounded-lg bg-slate-50 p-3 dark:bg-slate-700/50">
                <div className="mb-1 flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  {icon}
                  <span className="text-xs">{label}</span>
                </div>
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {typeof value === "number" ? value.toLocaleString("en-AU") : value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROW 3: Deal Performance ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Deal Performance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-sm">Active Deals</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{activeDeals.length}</p>
            <p className="mt-1 text-xs text-slate-400">Leads with deal ID</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              <span className="text-sm">Pipeline Value</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{fmt$(pipelineValue)}</p>
            <p className="mt-1 text-xs text-slate-400">Sum of deal values in pipeline</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">Commission Paid</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{fmt$(commissionPaid)}</p>
            <p className="mt-1 text-xs text-slate-400">All-time paid</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-sm">Commission Pending</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{fmt$(commissionPending)}</p>
            <p className="mt-1 text-xs text-slate-400">Awaiting payment</p>
          </div>
        </div>
      </section>

      {/* ── ROW 4: Training ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Last 5 sessions table */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center gap-2">
            <Award className="h-4 w-4 text-indigo-500" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Recent Training Sessions</h2>
          </div>

          {recentSessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              No training sessions yet. Complete a roleplay to see your results here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:text-slate-500">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Scenario</th>
                    <th className="pb-2 pr-3">Difficulty</th>
                    <th className="pb-2 pr-3">Score</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {recentSessions.map((s) => {
                    const dateStr = new Date(s.completedAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    });
                    const scenario = s.scenarioType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    const difficulty = s.difficulty ?? "easy";
                    const score = s.score?.total ?? 0;

                    return (
                      <tr key={s.id} className="group">
                        <td className="py-2.5 pr-3 font-medium text-slate-700 dark:text-slate-200">{dateStr}</td>
                        <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{scenario}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              DIFFICULTY_COLORS[difficulty] ?? DIFFICULTY_COLORS.easy
                            }`}
                          >
                            {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`font-semibold ${
                              score >= 30
                                ? "text-green-600 dark:text-green-400"
                                : score >= 20
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {score}
                            <span className="text-xs font-normal text-slate-400">/40</span>
                          </span>
                        </td>
                        <td className="py-2.5">
                          <button
                            className="invisible flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 group-hover:visible dark:text-indigo-400 dark:hover:bg-indigo-900/30"
                            title="View session replay"
                            onClick={() => {
                              /* Placeholder: open RoleplayReplay modal with s.id */
                            }}
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Skill breakdown bars */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-500" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Skill Breakdown</h2>
            <span className="ml-auto text-xs text-slate-400">Avg. last 10 sessions</span>
          </div>

          {Object.values(skillAverages).every((v) => v === 0) ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              Complete at least one training session to see skill scores.
            </p>
          ) : (
            <div className="space-y-4">
              {(Object.entries(skillAverages) as [string, number][]).map(([key, val]) => (
                <SkillBar
                  key={key}
                  label={SKILL_LABELS[key] ?? key}
                  value={val}
                  max={10}
                  isWeakest={weakestSkill === key}
                />
              ))}
            </div>
          )}

          {weakestSkill && !Object.values(skillAverages).every((v) => v === 0) && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <span className="font-semibold">Focus area: </span>
              {SKILL_LABELS[weakestSkill]} is your lowest-scoring skill. Practise scenarios that emphasise this area to
              improve your overall score.
            </div>
          )}
        </div>
      </section>

      {/* ── ROW 5: DRAPS Funnel ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-indigo-500" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">DRAPS Funnel &mdash; Today</h2>
          </div>
          {drapsToday && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Logged at{" "}
              {new Date(drapsToday.createdAt).toLocaleTimeString("en-AU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {!drapsToday ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center dark:border-slate-600">
            <p className="text-sm text-slate-400 dark:text-slate-500">No DRAPS entry logged for today yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex min-w-[480px] items-start justify-between">
              <FunnelStep
                label="D"
                sublabel="DQ'd"
                count={drapsToday.dq}
                conversionPct={funnelConv(drapsToday.dq, drapsToday.referrals)}
              />
              <FunnelStep
                label="R"
                sublabel="Referrals"
                count={drapsToday.referrals}
                conversionPct={funnelConv(drapsToday.referrals, drapsToday.appointments)}
              />
              <FunnelStep
                label="A"
                sublabel="Appointments"
                count={drapsToday.appointments}
                conversionPct={funnelConv(drapsToday.appointments, drapsToday.presentations)}
              />
              <FunnelStep
                label="P"
                sublabel="Presentations"
                count={drapsToday.presentations}
                conversionPct={funnelConv(drapsToday.presentations, drapsToday.sold)}
              />
              <FunnelStep label="S" sublabel="Sales / Booked" count={drapsToday.sold} isLast />
            </div>

            {/* Additional FC / FR metrics */}
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 dark:border-slate-700 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "FC Appts", value: drapsToday.fcAppts },
                { label: "FC Presented", value: drapsToday.fcPresented },
                { label: "FC Booked", value: drapsToday.fcBooked },
                { label: "FR Appts", value: drapsToday.frAppts },
                { label: "FR Presented", value: drapsToday.frPresented },
                { label: "FR Booked", value: drapsToday.frBooked },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-xl font-bold text-slate-800 dark:text-white">{value}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── ROW 6: Activity Feed ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-500" />
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Recent Call Activity</h2>
          <span className="ml-auto text-xs text-slate-400">Last 10 calls</span>
        </div>

        {activityFeed.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center dark:border-slate-600">
            <p className="text-sm text-slate-400 dark:text-slate-500">No call history logged yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {activityFeed.map((item, idx) => {
              const resultKey = item.result.replace(/\s+/g, "_").toLowerCase();
              const colorClass =
                RESULT_COLORS[resultKey] ??
                RESULT_COLORS[item.result] ??
                "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";

              return (
                <div key={idx} className="flex items-start gap-3 py-3">
                  <div className="mt-0.5 flex-shrink-0">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{item.leadName}</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
                        {resultLabel(item.result)}
                      </span>
                      <span className="ml-auto flex-shrink-0 text-xs text-slate-400">
                        {item.date}
                        {item.time ? ` \u00b7 ${item.time}` : ""}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {item.notes.length > 100 ? `${item.notes.slice(0, 100)}\u2026` : item.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default RepDashboard;
