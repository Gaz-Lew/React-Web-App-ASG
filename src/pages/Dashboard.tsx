import React, { useMemo } from "react";
import { Lead, DEFAULT_STATUS_COLORS } from "../types";
import { useLeads } from "../hooks/useFirebase";
import { useAppStore } from "../stores/appStore";
import { DonutChart } from "../components/DonutChart";
import {
  Phone,
  Users,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Clock,
  Loader,
  Star,
  Activity,
  BarChart2,
  ArrowUp,
  ArrowRight,
  CheckCircle2,
  PhoneCall,
  UserCheck,
  Zap,
  ClipboardList,
  MapPin,
  FileText,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isOverdue(dateStr: string) {
  return new Date(dateStr) < new Date();
}

function timeUntil(dateStr: string, timeStr?: string) {
  const dt = new Date(`${dateStr}${timeStr ? "T" + timeStr : "T00:00"}`);
  const diff = dt.getTime() - Date.now();
  if (diff < 0) {
    const m = Math.abs(Math.round(diff / 60000));
    if (m < 60) return `${m}m overdue`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h overdue`;
    return `${Math.floor(h / 24)}d overdue`;
  }
  const m = Math.round(diff / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

// Normalise call date to YYYY-MM-DD regardless of old ISO string or new date-only format
function normCallDate(d: string): string {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : parsed.toISOString().split("T")[0];
}

function timeAgo(dateStr: string, timeStr?: string) {
  // Handle both new format (YYYY-MM-DD + HH:MM) and old (ISO strings stored directly)
  const isNewFmt = /^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? "") && (!timeStr || /^\d{2}:\d{2}$/.test(timeStr));
  const dt = isNewFmt ? new Date(`${dateStr}T${timeStr || "00:00"}`) : new Date(timeStr || dateStr || ""); // old ISO fallback
  const diff = Date.now() - dt.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function greeting(name: string) {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${name} 👋`;
  if (h < 17) return `Good afternoon, ${name} 👋`;
  return `Good evening, ${name} 👋`;
}

function fmtDate() {
  return new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon,
  gradient,
  border,
  trend,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
  border: string;
  trend?: { dir: "up" | "down" | "neutral"; label: string };
}) {
  return (
    <div
      className={`bg-white dark:bg-[var(--surface)] rounded-2xl p-4 sm:p-5 border ${border} shadow-sm hover:shadow-md dark:hover:shadow-slate-900/50 hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 group`}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${gradient}`}
        >
          {icon}
        </div>
        {trend && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
              trend.dir === "up"
                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                : trend.dir === "down"
                  ? "bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400"
                  : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400"
            }`}
          >
            {trend.dir === "up" ? (
              <ArrowUp size={9} />
            ) : trend.dir === "down" ? (
              <ArrowUp size={9} className="rotate-180" />
            ) : null}
            {trend.label}
          </span>
        )}
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-none mb-1 tabular-nums">
        {value}
      </div>
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── Calls Bar Chart ───────────────────────────────────────────────────────────
function CallsBarChart({
  callsByDay,
}: {
  callsByDay: { label: string; shortDate: string; count: number; isToday: boolean }[];
}) {
  const maxVal = Math.max(...callsByDay.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1.5 sm:gap-2 h-28 sm:h-36 pt-2">
      {callsByDay.map((day) => {
        const pct = (day.count / maxVal) * 100;
        return (
          <div key={day.shortDate} className="flex-1 flex flex-col items-center gap-1 group/bar">
            <span
              className={`text-[10px] sm:text-xs font-semibold transition-opacity ${day.count > 0 ? "opacity-100" : "opacity-0 group-hover/bar:opacity-60"} ${day.isToday ? "text-amber-500" : "text-gray-500 dark:text-gray-400"}`}
            >
              {day.count || ""}
            </span>
            <div className="w-full flex items-end rounded-t-lg overflow-hidden" style={{ height: "80px" }}>
              <div
                className={`w-full rounded-t-lg transition-all duration-700 ease-out ${day.isToday ? "bg-amber-500" : "bg-panel dark:bg-hover group-hover/bar:bg-hover dark:group-hover/bar:bg-panel"}`}
                style={{ height: `${Math.max(pct, day.count > 0 ? 6 : 2)}%`, opacity: day.count === 0 ? 0.25 : 1 }}
              />
            </div>
            <span
              className={`text-[10px] sm:text-xs font-medium ${day.isToday ? "text-amber-500 font-bold" : "text-gray-400 dark:text-gray-500"}`}
            >
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Conversion Funnel ─────────────────────────────────────────────────────────
function FunnelStep({
  label,
  count,
  total,
  color,
  icon,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  icon: React.ReactNode;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
          <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{count.toLocaleString()}</span>
        </div>
        <div className="w-full h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${color.replace("bg-", "bg-").replace("/20", "")}`}
            style={{ width: `${pct}%`, backgroundColor: undefined }}
          />
        </div>
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500 w-10 text-right flex-shrink-0 tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

// ── Result badge colours ──────────────────────────────────────────────────────
function resultBadge(result?: string) {
  const r = (result || "").toLowerCase();
  if (r.includes("book") || r.includes("appt"))
    return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
  if (r.includes("interest")) return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300";
  if (r.includes("callback") || r.includes("revisit"))
    return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
  if (r.includes("not") || r.includes("wrong") || r.includes("no answer"))
    return "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400";
  return "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200";
}

function repInitial(name?: string) {
  return (name || "?").charAt(0).toUpperCase();
}

// ── Quick action card ─────────────────────────────────────────────────────────
function QuickAction({
  label,
  icon,
  color,
  onClick,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl border transition hover:scale-[1.03] active:scale-[0.97] cursor-pointer select-none ${color}`}
    >
      <div className="relative">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      <span className="text-xs font-semibold whitespace-nowrap">{label}</span>
    </button>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export function DashboardPage({
  onCallLead,
  onNavigate,
}: {
  onCallLead?: (lead: Lead) => void;
  onNavigate?: (page: string, filter?: { type: "leads" | "clients"; value: string }) => void;
}) {
  const { leads, loading } = useLeads();
  const { currentUser, reps, statusColors } = useAppStore();
  const today = todayStr();
  const weekStart = startOfWeek();

  // ── All calls flattened ──────────────────────────────────────────────────
  const allCalls = useMemo(
    () =>
      leads.flatMap((l) =>
        (l.callHistory || []).map((c) => ({
          ...c,
          leadId: l.id,
          leadName: l.name || "—",
          leadStatus: l.status,
        })),
      ),
    [leads],
  );

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const callsToday = allCalls.filter((c) => normCallDate(c.date) === today).length;
    const callsThisWeek = allCalls.filter((c) => normCallDate(c.date) >= weekStart).length;
    const booked = leads.filter((l) => l.status === "Booked").length;
    const live = leads.filter((l) => l.status === "Live").length;
    const dq = leads.filter((l) => l.status === "DQ").length;
    const newToday = leads.filter((l) => l.leadDate === today).length;
    const newThisWeek = leads.filter((l) => (l.leadDate ?? "") >= weekStart).length;
    const callbacks = leads
      .filter((l) => l.callbackDate)
      .sort((a, b) => new Date(a.callbackDate!).getTime() - new Date(b.callbackDate!).getTime());
    const overdueCount = callbacks.filter((l) => isOverdue(l.callbackDate!)).length;
    const convRate = leads.length > 0 ? ((booked / leads.length) * 100).toFixed(1) : "0.0";

    return {
      callsToday,
      callsThisWeek,
      booked,
      live,
      dq,
      newToday,
      newThisWeek,
      callbacks,
      overdueCount,
      total: leads.length,
      convRate,
    };
  }, [leads, allCalls, today, weekStart]);

  // ── Action Required ─────────────────────────────────────────────────────
  const actionRequired = useMemo(() => {
    const noAppointment = leads.filter((l) => l.status === "Booked" && !l.fcAppt?.date).length;
    const fcCompletedNoFr = leads.filter((l) => l.fcAppt?.result === "Completed" && !l.frAppt?.date).length;
    const noContact = leads.filter((l) => !l.callHistory || l.callHistory.length === 0).length;
    return { noAppointment, fcCompletedNoFr, noContact };
  }, [leads]);

  // ── Calls per day (last 7 days) ───────────────────────────────────────────
  const callsByDay = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateKey = d.toISOString().split("T")[0];
      const label = i === 6 ? "Today" : d.toLocaleDateString("en-AU", { weekday: "short" });

      return {
        shortDate: dateKey,
        label,
        count: allCalls.filter((c) => normCallDate(c.date) === dateKey).length,
        isToday: dateKey === today,
      };
    });
  }, [allCalls, today]);

  // ── Conversion funnel data ───────────────────────────────────────────────
  const funnelTotal = stats.total;

  // ── Status donut ─────────────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach((l) => {
      map[l.status] = (map[l.status] || 0) + 1;
    });
    return Object.entries(map)
      .map(([label, value]) => ({
        label,
        value,
        color: statusColors[label] ?? DEFAULT_STATUS_COLORS[label] ?? "#9ca3af",
      }))
      .sort((a, b) => b.value - a.value);
  }, [leads, statusColors]);

  // ── Recent activity (last 20 calls) ─────────────────────────────────────
  const recentActivity = useMemo(() => {
    return [...allCalls]
      .sort((a, b) => {
        const isNewFmtB = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") && (!b.time || /^\d{2}:\d{2}$/.test(b.time));
        const isNewFmtA = /^\d{4}-\d{2}-\d{2}$/.test(a.date ?? "") && (!a.time || /^\d{2}:\d{2}$/.test(a.time));
        const ta = isNewFmtB
          ? new Date(`${b.date}T${b.time || "00:00"}`).getTime()
          : new Date(b.time || b.date || "").getTime();
        const tb = isNewFmtA
          ? new Date(`${a.date}T${a.time || "00:00"}`).getTime()
          : new Date(a.time || a.date || "").getTime();
        return ta - tb;
      })
      .slice(0, 18);
  }, [allCalls]);

  // ── Rep leaderboard ──────────────────────────────────────────────────────
  const repStats = useMemo(() => {
    return reps
      .filter((r) => r.active)
      .map((rep) => {
        const repCalls = allCalls.filter((c) => c.rep === rep.name || (c as { repId?: number }).repId === rep.id);
        const callsToday = repCalls.filter((c) => normCallDate(c.date) === today).length;
        const callsWeek = repCalls.filter((c) => normCallDate(c.date) >= weekStart).length;
        const leadsOwned = leads.filter((l) => l.dqRep === rep.id).length;
        const bookedCount = leads.filter((l) => l.dqRep === rep.id && l.status === "Booked").length;
        const liveCount = leads.filter((l) => l.dqRep === rep.id && l.status === "Live").length;
        return { rep, total: repCalls.length, callsToday, callsWeek, leadsOwned, bookedCount, liveCount };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [reps, allCalls, leads, today, weekStart]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size={32} className="animate-spin text-amber-500" />
      </div>
    );
  }

  const maxCalls = Math.max(...repStats.map((r) => r.total), 1);

  return (
    <div className="flex-1 overflow-y-auto bg-white dark:bg-[var(--bg)] p-3 sm:p-4 md:p-5 space-y-4 sm:space-y-5">
      {/* ── Hero banner ── */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #121214 0%, #1A1A1D 50%, #121214 100%)",
          boxShadow: "0 4px 32px rgba(18,18,20,0.35)",
        }}
      >
        {/* Subtle dot grid overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle, #c9a84c 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* Gold accent line */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
          style={{ background: "linear-gradient(to bottom, #c9a84c, #f59e0b, #c9a84c)" }}
        />

        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 p-5 sm:p-6">
          {/* Logo */}
          <img
            src="/asg-circle.png"
            alt="ASG"
            className="w-16 h-16 rounded-full object-cover flex-shrink-0 hidden sm:block"
            style={{ border: "2px solid rgba(201,168,76,0.5)", boxShadow: "0 0 24px rgba(201,168,76,0.2)" }}
          />

          {/* Greeting text */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
              {greeting(currentUser?.name || "there")}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "rgba(201,168,76,0.9)" }}>
              {fmtDate()}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {stats.total.toLocaleString()} leads live
              </span>
              {stats.newToday > 0 && (
                <span
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(201,168,76,0.2)", color: "#f5c842" }}
                >
                  <ArrowUp size={10} />
                  {stats.newToday} added today
                </span>
              )}
              {stats.overdueCount > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-300">
                  <AlertTriangle size={10} />
                  {stats.overdueCount} overdue callbacks
                </span>
              )}
            </div>
          </div>

          {/* Right-side key number */}
          <div className="hidden lg:flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
            <span className="text-4xl font-black text-white tabular-nums">{stats.callsToday}</span>
            <span className="text-xs font-medium" style={{ color: "rgba(201,168,76,0.8)" }}>
              calls today
            </span>
            <span className="text-[10px] text-white/40">{stats.callsThisWeek} this week</span>
          </div>
        </div>

        {/* Quick actions strip */}
        <div className="relative border-t border-white/10 px-5 sm:px-6 py-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40 flex-shrink-0 mr-1">
            Quick
          </span>
          <QuickAction
            label="Add Lead"
            icon={<Users size={16} className="text-amber-400" />}
            color="bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20"
            onClick={() => onNavigate?.("leads")}
          />
          <QuickAction
            label="DQ Import"
            icon={<ClipboardList size={16} className="text-gray-400" />}
            color="bg-gray-500/10 border-gray-500/20 text-gray-300 hover:bg-gray-500/20"
            onClick={() => onNavigate?.("dq-import")}
          />
          <QuickAction
            label="Callbacks"
            icon={<Phone size={16} className="text-emerald-400" />}
            color="bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
            badge={stats.overdueCount}
            onClick={() => onNavigate?.("leads")}
          />
          <QuickAction
            label="Map"
            icon={<MapPin size={16} className="text-purple-400" />}
            color="bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20"
            onClick={() => onNavigate?.("map")}
          />
          <QuickAction
            label="DRAPS"
            icon={<Zap size={16} className="text-gray-400" />}
            color="bg-gray-500/10 border-gray-500/20 text-gray-300 hover:bg-gray-500/20"
            onClick={() => onNavigate?.("draps")}
          />
          <QuickAction
            label="Documents"
            icon={<FileText size={16} className="text-rose-400" />}
            color="bg-rose-500/10 border-rose-500/20 text-rose-300 hover:bg-rose-500/20"
            onClick={() => onNavigate?.("document-centre")}
          />
        </div>
      </div>

      {/* ── Stat cards (6) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <StatCard
          label="Total Leads"
          value={stats.total.toLocaleString()}
          sub={`${stats.newThisWeek} added this week`}
          icon={<Users size={20} className="text-gray-600 dark:text-gray-400" />}
          gradient="bg-gray-50 dark:bg-gray-800/30"
          border="border-gray-100 dark:border-gray-700/50"
        />
        <StatCard
          label="Calls Today"
          value={stats.callsToday}
          sub={`${stats.callsThisWeek} this week`}
          icon={<PhoneCall size={20} className="text-green-600 dark:text-green-400" />}
          gradient="bg-green-50 dark:bg-green-900/30"
          border="border-green-100 dark:border-green-900/50"
          trend={stats.callsToday > 0 ? { dir: "up", label: `${stats.callsToday} today` } : undefined}
        />
        <StatCard
          label="Live Leads"
          value={stats.live}
          sub="actively working"
          icon={<Activity size={20} className="text-gray-600 dark:text-gray-400" />}
          gradient="bg-gray-50 dark:bg-gray-800/30"
          border="border-gray-100 dark:border-gray-700/50"
        />
        <StatCard
          label="Booked"
          value={stats.booked}
          sub="appointments set"
          icon={<CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />}
          gradient="bg-emerald-50 dark:bg-emerald-900/30"
          border="border-emerald-100 dark:border-emerald-900/50"
          trend={stats.booked > 0 ? { dir: "up", label: `${stats.convRate}%` } : undefined}
        />
        <StatCard
          label="Conversion"
          value={`${stats.convRate}%`}
          sub={`${stats.booked} of ${stats.total} leads`}
          icon={<TrendingUp size={20} className="text-amber-600 dark:text-amber-400" />}
          gradient="bg-amber-50 dark:bg-amber-900/30"
          border="border-amber-100 dark:border-amber-900/50"
        />
        <StatCard
          label="Callbacks Due"
          value={stats.callbacks.length}
          sub={stats.overdueCount > 0 ? `⚠️ ${stats.overdueCount} overdue` : "all on time"}
          icon={<AlertTriangle size={20} className={stats.overdueCount > 0 ? "text-red-500" : "text-slate-400"} />}
          gradient={stats.overdueCount > 0 ? "bg-red-50 dark:bg-red-900/30" : "bg-slate-50 dark:bg-slate-700/50"}
          border={
            stats.overdueCount > 0 ? "border-red-100 dark:border-red-900/50" : "border-gray-100 dark:border-slate-700"
          }
          trend={stats.overdueCount > 0 ? { dir: "down", label: `${stats.overdueCount} late` } : undefined}
        />
      </div>

      {/* ── Action Required ── */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-100 dark:border-slate-700 p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Action Required</h3>
        <div className="space-y-2">
          <div
            className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            onClick={() => onNavigate?.("leads", { type: "leads", value: "clients-no-fc" })}
          >
            <span className="text-sm text-amber-800 dark:text-amber-200">Clients needing FC booking</span>
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {actionRequired.noAppointment}
            </span>
          </div>
          <div
            className="flex items-center justify-between p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
            onClick={() => onNavigate?.("client-hub", { type: "clients", value: "fc-completed-no-fr" })}
          >
            <span className="text-sm text-orange-800 dark:text-orange-200">FC completed, needs FR booking</span>
            <span className="text-sm font-semibold text-orange-800 dark:text-orange-200">
              {actionRequired.fcCompletedNoFr}
            </span>
          </div>
          <div
            className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            onClick={() => onNavigate?.("leads", { type: "leads", value: "no-contact" })}
          >
            <span className="text-sm text-red-800 dark:text-red-200">Leads with no contact yet</span>
            <span className="text-sm font-semibold text-red-800 dark:text-red-200">{actionRequired.noContact}</span>
          </div>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* 7-day call volume */}
        <div className="lg:col-span-3 bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-100 dark:border-slate-700 p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Call Volume</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last 7 days</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-gray-400 dark:bg-gray-500 opacity-80" />
                Previous
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-500" />
                Today
              </span>
            </div>
          </div>
          <CallsBarChart callsByDay={callsByDay} />
        </div>

        {/* Conversion funnel */}
        <div className="lg:col-span-2 bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-100 dark:border-slate-700 p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Pipeline</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Lead status breakdown</p>
          </div>
          <div className="space-y-3">
            <FunnelStep
              label="DQ'd"
              count={stats.dq}
              total={funnelTotal}
              color="bg-slate-100 dark:bg-slate-700"
              icon={<Users size={14} className="text-slate-500 dark:text-slate-400" />}
            />
            <div className="flex justify-center">
              <ArrowRight size={14} className="text-gray-300 dark:text-slate-600 rotate-90" />
            </div>
            <FunnelStep
              label="Live"
              count={stats.live}
              total={funnelTotal}
              color="bg-gray-100 dark:bg-gray-800/40"
              icon={<Activity size={14} className="text-gray-600 dark:text-gray-400" />}
            />
            <div className="flex justify-center">
              <ArrowRight size={14} className="text-gray-300 dark:text-slate-600 rotate-90" />
            </div>
            <FunnelStep
              label="Booked"
              count={stats.booked}
              total={funnelTotal}
              color="bg-emerald-100 dark:bg-emerald-900/40"
              icon={<CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />}
            />
          </div>

          {/* Status mini-breakdown */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
            <div className="flex flex-wrap gap-1.5">
              {statusCounts.slice(0, 6).map((s) => (
                <span
                  key={s.label}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-400"
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label} {s.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Lower row: callbacks + activity ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Callback queue */}
        <div className="lg:col-span-2 bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-100 dark:border-slate-700 p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Callback Queue</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{stats.callbacks.length} scheduled</p>
            </div>
            {stats.overdueCount > 0 && (
              <span className="text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 px-2 py-0.5 rounded-full">
                {stats.overdueCount} overdue
              </span>
            )}
          </div>
          {stats.callbacks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 text-gray-300 dark:text-slate-600 gap-2">
              <Calendar size={32} />
              <span className="text-sm text-gray-400 dark:text-gray-500">No callbacks scheduled</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
              {stats.callbacks.slice(0, 8).map((lead) => {
                const overdue = isOverdue(lead.callbackDate!);
                const rep = reps.find((r) => r.id === lead.dqRep)?.name || "—";
                return (
                  <div
                    key={lead.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-colors ${
                      overdue
                        ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20"
                        : "border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-900/50"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${overdue ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}
                    >
                      {repInitial(rep)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900 dark:text-white text-xs truncate">
                          {lead.name}
                        </span>
                        {overdue && (
                          <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 px-1 py-0.5 rounded flex-shrink-0">
                            LATE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        <Clock size={9} />
                        <span>{timeUntil(lead.callbackDate!, lead.callbackTime)}</span>
                        <span>· {rep}</span>
                      </div>
                    </div>
                    {onCallLead && (
                      <button
                        onClick={() => onCallLead(lead)}
                        className="flex-shrink-0 p-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition"
                      >
                        <Phone size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity feed */}
        <div className="lg:col-span-3 bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-100 dark:border-slate-700 p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Recent Activity</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Latest call logs across all leads</p>
          </div>
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 text-gray-300 dark:text-slate-600 gap-2">
              <Activity size={32} />
              <span className="text-sm text-gray-400 dark:text-gray-500">No calls logged yet</span>
            </div>
          ) : (
            <div className="space-y-0 max-h-64 overflow-y-auto divide-y divide-gray-50 dark:divide-slate-700/50">
              {recentActivity.map((call, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0">
                  <div className="w-7 h-7 rounded-full bg-panel flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {repInitial(call.rep)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{call.leadName}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                      {call.rep || "Unknown"} · {timeAgo(call.date, call.time)}
                    </p>
                  </div>
                  {call.result && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${resultBadge(call.result)}`}
                    >
                      {call.result}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Rep leaderboard (full width, upgraded) ── */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-100 dark:border-slate-700 p-4 sm:p-5 hover:scale-[1.01] active:scale-[0.98] transition-all duration-150">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Rep Leaderboard</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Ranked by total calls logged</p>
          </div>
          <Star size={16} className="text-amber-400" />
        </div>

        {repStats.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">No calls logged yet</div>
        ) : (
          <>
            {/* Column headers — hidden on mobile */}
            <div className="hidden sm:grid grid-cols-[2rem_1fr_3fr_5rem_5rem_5rem] gap-3 items-center mb-2 px-1">
              <span />
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Rep
              </span>
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Activity
              </span>
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">
                Calls
              </span>
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">
                This Week
              </span>
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">
                Booked
              </span>
            </div>

            <div className="space-y-2">
              {repStats.map((item, i) => {
                const pct = (item.total / maxCalls) * 100;
                const medals = ["🥇", "🥈", "🥉"];
                const isTop3 = i < 3;
                return (
                  <div
                    key={item.rep.id}
                    className={`grid grid-cols-[2rem_1fr] sm:grid-cols-[2rem_1fr_3fr_5rem_5rem_5rem] gap-3 items-center p-3 rounded-xl transition-colors ${
                      isTop3
                        ? "bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30"
                        : "bg-gray-50 dark:bg-slate-900/50 border border-gray-100 dark:border-slate-700/50"
                    }`}
                  >
                    {/* Rank */}
                    <span className="text-base text-center w-8 flex-shrink-0">
                      {medals[i] || <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{i + 1}</span>}
                    </span>

                    {/* Name + today badge */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${isTop3 ? "bg-amber-500" : "bg-slate-400 dark:bg-slate-600"}`}
                        >
                          {repInitial(item.rep.name)}
                        </div>
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                          {item.rep.name}
                        </span>
                        {item.callsToday > 0 && (
                          <span className="hidden sm:inline text-[10px] font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            +{item.callsToday} today
                          </span>
                        )}
                      </div>
                      {/* Mobile: show mini bar */}
                      <div className="sm:hidden mt-1.5 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {/* Progress bar (desktop) */}
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${isTop3 ? "bg-amber-500" : "bg-panel dark:bg-hover"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Total calls */}
                    <div className="hidden sm:block text-right">
                      <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{item.total}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">calls</span>
                    </div>

                    {/* This week */}
                    <div className="hidden sm:block text-right">
                      <span
                        className={`text-sm font-bold tabular-nums ${item.callsWeek > 0 ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500"}`}
                      >
                        {item.callsWeek}
                      </span>
                    </div>

                    {/* Booked */}
                    <div className="hidden sm:block text-right">
                      <span
                        className={`text-sm font-bold tabular-nums ${item.bookedCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}
                      >
                        {item.bookedCount}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
