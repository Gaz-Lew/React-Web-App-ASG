/**
 * DRAPS Page — Daily Reporting & Activity Performance Stats
 *
 * Tracks per-rep daily field metrics:
 * DQ generated, referrals, appointments, presentations, sold
 * Plus FC (Finance Consultant) and FR (Financial Review) sub-metrics.
 *
 * Upgraded v2:
 * - Conversion funnel (DQ → Appt → Pres → Sold)
 * - Per-rep leaderboard (sortable)
 * - FC/FR summary cards
 * - Date-grouped history table with per-group totals
 * - Export CSV
 */

import React, { useState, useMemo } from "react";
import { DrapsEntry } from "../types";
import { useAppStore } from "../stores/appStore";
import { useDraps, useSaveDraps, useDeleteDraps, useAppSettings } from "../hooks/useFirebase";
import { useToast } from "../context/ToastContext";
import { BarChart3, Plus, Trash2, Calendar, ChevronDown, ChevronUp, Download, Trophy, TrendingUp } from "lucide-react";

type DateRange = "week" | "month" | "quarter" | "all" | "custom";
type LeaderboardSort = "dq" | "appointments" | "presentations" | "sold" | "referrals" | "fcBooked" | "frBooked";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nextId(entries: DrapsEntry[]): number {
  return entries.length === 0 ? 1 : Math.max(...entries.map((e) => e.id)) + 1;
}

function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// ── Amber stepper counter ─────────────────────────────────────────────────────
function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-amber-600 dark:text-amber-400 tracking-wide">{label}</label>
      <div className="flex items-stretch rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden bg-white dark:bg-[var(--surface)] focus-within:ring-2 focus-within:ring-amber-400 focus-within:border-amber-400">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-9 flex items-center justify-center bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 active:bg-amber-200 transition font-bold text-base select-none border-r border-gray-200 dark:border-white/[0.06] flex-shrink-0"
          tabIndex={-1}
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="flex-1 min-w-0 text-center text-gray-900 dark:text-white bg-transparent text-sm font-semibold focus:outline-none py-1.5 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-9 flex items-center justify-center bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 active:bg-amber-200 transition font-bold text-base select-none border-l border-gray-200 dark:border-white/[0.06] flex-shrink-0"
          tabIndex={-1}
        >
          +
        </button>
      </div>
    </div>
  );
}

const emptyForm = () => ({
  date: todayStr(),
  repId: 0,
  dq: 0,
  referrals: 0,
  appointments: 0,
  presentations: 0,
  sold: 0,
  fcAppts: 0,
  fcPresented: 0,
  fcBooked: 0,
  frAppts: 0,
  frPresented: 0,
  frBooked: 0,
});

// ── Conversion funnel step ────────────────────────────────────────────────────
function FunnelStep({ label, value, pct, color }: { label: string; value: number; pct?: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center leading-tight">{label}</div>
      {pct !== undefined && (
        <div
          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
            pct >= 50
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : pct >= 25
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          }`}
        >
          {pct}%
        </div>
      )}
    </div>
  );
}

function FunnelArrow() {
  return <div className="flex-shrink-0 text-gray-300 dark:text-slate-600 text-lg self-center pb-5">›</div>;
}

// ── Mini bar (for leaderboard) ────────────────────────────────────────────────
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 tabular-nums w-6 text-right">
        {value}
      </span>
    </div>
  );
}

// ── Target progress bar ───────────────────────────────────────────────────────
function TargetBar({
  label,
  value,
  target,
  color = "bg-amber-500",
}: {
  label: string;
  value: number;
  target: number;
  color?: string;
}) {
  if (!target) return null;
  const pct = Math.min(100, Math.round((value / target) * 100));
  const isOver = value >= target;
  return (
    <div className="mt-1">
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-0.5">
        <span>{label}</span>
        <span className={isOver ? "text-green-500 font-semibold" : ""}>
          {value}/{target} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isOver ? "bg-green-500" : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────
function exportCSV(entries: DrapsEntry[], filename: string) {
  const headers = [
    "Date",
    "Rep",
    "DQ",
    "Referrals",
    "Appointments",
    "Presentations",
    "Sold",
    "FC Appts",
    "FC Presented",
    "FC Booked",
    "FR Appts",
    "FR Presented",
    "FR Booked",
  ];
  const rows = entries.map((e) =>
    [
      e.date,
      e.repName,
      e.dq,
      e.referrals,
      e.appointments,
      e.presentations,
      e.sold,
      e.fcAppts,
      e.fcPresented,
      e.fcBooked,
      e.frAppts,
      e.frPresented,
      e.frBooked,
    ].join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function DrapsPage() {
  const { reps, currentUser } = useAppStore();
  const { entries, loading } = useDraps();
  const { save } = useSaveDraps();
  const { remove } = useDeleteDraps();
  const { showToast } = useToast();
  const { settings } = useAppSettings();

  const activeReps = useMemo(() => reps.filter((r) => r.active), [reps]);

  const [form, setForm] = useState(() => ({
    ...emptyForm(),
    repId: currentUser?.id ?? 0,
  }));
  const [saving, setSaving] = useState(false);
  const isAdmin = currentUser?.role === "admin";
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Admins default to all reps; regular reps default to their own entries
  const [filterRep, setFilterRep] = useState<number | "all">(() => (isAdmin ? "all" : (currentUser?.id ?? "all")));
  const [expandFC, setExpandFC] = useState(false);
  const [expandFR, setExpandFR] = useState(false);
  const [lbSort, setLbSort] = useState<LeaderboardSort>("dq");
  const [lbDir, setLbDir] = useState<"desc" | "asc">("desc");
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  const setF = (field: keyof typeof form, val: string | number) => setForm((p) => ({ ...p, [field]: val }));

  const handleSave = async () => {
    if (!form.repId) {
      showToast("Please select a rep", "error");
      return;
    }
    if (!form.date) {
      showToast("Please select a date", "error");
      return;
    }
    setSaving(true);
    const repName = reps.find((r) => r.id === form.repId)?.name ?? "";
    const entry: DrapsEntry = {
      id: nextId(entries),
      date: form.date,
      repId: form.repId,
      repName,
      dq: form.dq,
      referrals: form.referrals,
      appointments: form.appointments,
      presentations: form.presentations,
      sold: form.sold,
      fcAppts: form.fcAppts,
      fcPresented: form.fcPresented,
      fcBooked: form.fcBooked,
      frAppts: form.frAppts,
      frPresented: form.frPresented,
      frBooked: form.frBooked,
      createdAt: Date.now(),
    };
    const ok = await save(entry);
    setSaving(false);
    if (ok) {
      showToast("✅ DRAPS entry saved", "success");
      setForm({ ...emptyForm(), repId: currentUser?.id ?? 0 });
    } else {
      showToast("Failed to save entry", "error");
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await remove(id);
    if (ok) showToast("Entry deleted", "success");
  };

  // ── Filter entries ──────────────────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    const now = new Date();
    return entries.filter((e) => {
      if (filterRep !== "all" && e.repId !== filterRep) return false;
      if (dateRange === "all") return true;
      if (dateRange === "custom") {
        if (customFrom && e.date < customFrom) return false;
        if (customTo && e.date > customTo) return false;
        return true;
      }
      const d = new Date(e.date);
      if (dateRange === "week") {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return d >= weekAgo;
      }
      if (dateRange === "month") {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      if (dateRange === "quarter") {
        const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        return d >= qStart;
      }
      return true;
    });
  }, [entries, dateRange, filterRep, customFrom, customTo]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = useMemo(
    () =>
      filteredEntries.reduce(
        (acc, e) => ({
          dq: acc.dq + e.dq,
          referrals: acc.referrals + e.referrals,
          appointments: acc.appointments + e.appointments,
          presentations: acc.presentations + e.presentations,
          sold: acc.sold + e.sold,
          fcAppts: acc.fcAppts + e.fcAppts,
          fcPresented: acc.fcPresented + e.fcPresented,
          fcBooked: acc.fcBooked + e.fcBooked,
          frAppts: acc.frAppts + e.frAppts,
          frPresented: acc.frPresented + e.frPresented,
          frBooked: acc.frBooked + e.frBooked,
        }),
        {
          dq: 0,
          referrals: 0,
          appointments: 0,
          presentations: 0,
          sold: 0,
          fcAppts: 0,
          fcPresented: 0,
          fcBooked: 0,
          frAppts: 0,
          frPresented: 0,
          frBooked: 0,
        },
      ),
    [filteredEntries],
  );

  // ── Conversion rates ───────────────────────────────────────────────────────
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : undefined);

  // ── Per-rep leaderboard ────────────────────────────────────────────────────
  const leaderboard = useMemo(() => {
    const map = new Map<
      number,
      {
        repId: number;
        repName: string;
        dq: number;
        referrals: number;
        appointments: number;
        presentations: number;
        sold: number;
        fcBooked: number;
        frBooked: number;
        entries: number;
      }
    >();
    filteredEntries.forEach((e) => {
      const existing = map.get(e.repId);
      if (existing) {
        existing.dq += e.dq;
        existing.referrals += e.referrals;
        existing.appointments += e.appointments;
        existing.presentations += e.presentations;
        existing.sold += e.sold;
        existing.fcBooked += e.fcBooked;
        existing.frBooked += e.frBooked;
        existing.entries += 1;
      } else {
        map.set(e.repId, {
          repId: e.repId,
          repName: e.repName,
          dq: e.dq,
          referrals: e.referrals,
          appointments: e.appointments,
          presentations: e.presentations,
          sold: e.sold,
          fcBooked: e.fcBooked,
          frBooked: e.frBooked,
          entries: 1,
        });
      }
    });
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const diff = (b[lbSort] ?? 0) - (a[lbSort] ?? 0);
      return lbDir === "desc" ? diff : -diff;
    });
    return arr;
  }, [filteredEntries, lbSort, lbDir]);

  const lbMax: Record<LeaderboardSort, number> = useMemo(
    () => ({
      dq: Math.max(...leaderboard.map((r) => r.dq), 1),
      referrals: Math.max(...leaderboard.map((r) => r.referrals), 1),
      appointments: Math.max(...leaderboard.map((r) => r.appointments), 1),
      presentations: Math.max(...leaderboard.map((r) => r.presentations), 1),
      sold: Math.max(...leaderboard.map((r) => r.sold), 1),
      fcBooked: Math.max(...leaderboard.map((r) => r.fcBooked), 1),
      frBooked: Math.max(...leaderboard.map((r) => r.frBooked), 1),
    }),
    [leaderboard],
  );

  // ── Per-rep weekly/monthly DQ for target bars ──────────────────────────────
  const repDQProgress = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const map = new Map<number, { weeklyDQ: number; monthlyDQ: number }>();
    // Use ALL entries (not filtered by rep/date) for accurate weekly/monthly targets
    entries.forEach((e) => {
      const d = new Date(e.date + "T00:00:00");
      const existing = map.get(e.repId) ?? { weeklyDQ: 0, monthlyDQ: 0 };
      if (d >= weekStart) existing.weeklyDQ += e.dq;
      if (d >= monthStart) existing.monthlyDQ += e.dq;
      map.set(e.repId, existing);
    });
    return map;
  }, [entries]);

  // ── Date-grouped history ───────────────────────────────────────────────────
  const groupedHistory = useMemo(() => {
    const map = new Map<string, DrapsEntry[]>();
    [...filteredEntries]
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((e) => {
        if (!map.has(e.date)) map.set(e.date, []);
        map.get(e.date)!.push(e);
      });
    return Array.from(map.entries()).map(([date, rows]) => ({
      date,
      rows,
      totals: rows.reduce(
        (acc, e) => ({
          dq: acc.dq + e.dq,
          referrals: acc.referrals + e.referrals,
          appointments: acc.appointments + e.appointments,
          presentations: acc.presentations + e.presentations,
          sold: acc.sold + e.sold,
        }),
        { dq: 0, referrals: 0, appointments: 0, presentations: 0, sold: 0 },
      ),
    }));
  }, [filteredEntries]);

  const toggleDate = (date: string) =>
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const toggleLbSort = (col: LeaderboardSort) => {
    if (lbSort === col) setLbDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setLbSort(col);
      setLbDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: LeaderboardSort }) => {
    if (lbSort !== col) return <span className="text-gray-300 dark:text-slate-600 ml-0.5">↕</span>;
    return <span className="text-amber-500 ml-0.5">{lbDir === "desc" ? "↓" : "↑"}</span>;
  };

  const rangeLabels: Record<DateRange, string> = {
    week: "Last 7 Days",
    month: "This Month",
    quarter: "This Quarter",
    all: "All Time",
    custom: "Custom Range",
  };

  // Build a meaningful filename for the export
  const exportFilename = (() => {
    const repLabel = filterRep === "all" ? "All Reps" : (activeReps.find((r) => r.id === filterRep)?.name ?? "Rep");
    const repSlug = repLabel.replace(/\s+/g, "-");
    if (dateRange === "custom") {
      const from = customFrom || "start";
      const to = customTo || todayStr();
      return `draps_${repSlug}_${from}_to_${to}.csv`;
    }
    return `draps_${repSlug}_${dateRange}_${todayStr()}.csv`;
  })();

  const rankColors = ["text-amber-500", "text-gray-400", "text-orange-600"];
  const rankBg = [
    "bg-amber-50 dark:bg-amber-900/10",
    "bg-gray-50 dark:bg-[var(--surface)]/30",
    "bg-orange-50 dark:bg-orange-900/10",
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[var(--bg)] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-amber-500" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">DRAPS & Stats</h1>
          <span className="text-sm text-gray-400 dark:text-gray-500 hidden sm:block">
            Daily Reporting & Activity Performance Stats
          </span>
        </div>
        <button
          onClick={() => exportCSV(filteredEntries, exportFilename)}
          disabled={filteredEntries.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-50 dark:hover:bg-[var(--hover)] disabled:opacity-40 transition"
          title={`Download: ${exportFilename}`}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Entry form */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
          <Plus size={14} className="text-amber-500" />
          Log Entry
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setF("date", e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Rep *</label>
            <select
              value={form.repId}
              onChange={(e) => setF("repId", Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value={0}>— Select Rep —</option>
              {activeReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            Field Metrics
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <Counter label="DQ" value={form.dq} onChange={(v) => setF("dq", v)} />
            <Counter label="Referrals" value={form.referrals} onChange={(v) => setF("referrals", v)} />
            <Counter label="Appointments" value={form.appointments} onChange={(v) => setF("appointments", v)} />
            <Counter label="Presentations" value={form.presentations} onChange={(v) => setF("presentations", v)} />
            <Counter label="Sold" value={form.sold} onChange={(v) => setF("sold", v)} />
          </div>
        </div>

        <div className="mb-3">
          <button
            className="flex items-center gap-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-600 dark:hover:text-gray-300 transition"
            onClick={() => setExpandFC(!expandFC)}
          >
            <ChevronDown size={12} className={`transition-transform ${expandFC ? "rotate-180" : ""}`} />
            FC Metrics (Finance Consultant)
          </button>
          {expandFC && (
            <div className="grid grid-cols-3 gap-3">
              <Counter label="FC Appts" value={form.fcAppts} onChange={(v) => setF("fcAppts", v)} />
              <Counter label="FC Presented" value={form.fcPresented} onChange={(v) => setF("fcPresented", v)} />
              <Counter label="FC Booked" value={form.fcBooked} onChange={(v) => setF("fcBooked", v)} />
            </div>
          )}
        </div>

        <div className="mb-4">
          <button
            className="flex items-center gap-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 hover:text-gray-600 dark:hover:text-gray-300 transition"
            onClick={() => setExpandFR(!expandFR)}
          >
            <ChevronDown size={12} className={`transition-transform ${expandFR ? "rotate-180" : ""}`} />
            FR Metrics (Financial Review)
          </button>
          {expandFR && (
            <div className="grid grid-cols-3 gap-3">
              <Counter label="FR Appts" value={form.frAppts} onChange={(v) => setF("frAppts", v)} />
              <Counter label="FR Presented" value={form.frPresented} onChange={(v) => setF("frPresented", v)} />
              <Counter label="FR Booked" value={form.frBooked} onChange={(v) => setF("frBooked", v)} />
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 disabled:opacity-50 transition text-sm"
        >
          {saving ? "Saving…" : "Save Entry"}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date range preset buttons */}
          <div className="flex rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden flex-shrink-0">
            {(["week", "month", "quarter", "all", "custom"] as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition border-r last:border-r-0 border-gray-200 dark:border-white/[0.06] ${
                  dateRange === r
                    ? "bg-amber-500 text-white"
                    : "bg-white dark:bg-[var(--surface)] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                }`}
              >
                {r === "custom" ? "📅 Custom" : rangeLabels[r]}
              </button>
            ))}
          </div>

          {/* Rep selector */}
          <select
            value={filterRep === "all" ? "" : filterRep}
            onChange={(e) => setFilterRep(e.target.value ? Number(e.target.value) : "all")}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">All Reps</option>
            {activeReps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <span className="text-xs text-gray-400 ml-auto">
            {filteredEntries.length} entries · {rangeLabels[dateRange]}
            {filterRep !== "all" && ` · ${activeReps.find((r) => r.id === filterRep)?.name ?? ""}`}
          </span>
        </div>

        {/* Custom date range pickers — only shown when 'custom' selected */}
        {dateRange === "custom" && (
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100 dark:border-white/[0.06]">
            <Calendar size={14} className="text-amber-500 flex-shrink-0" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            {(customFrom || customTo) && (
              <button
                onClick={() => {
                  setCustomFrom("");
                  setCustomTo("");
                }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition underline"
              >
                Clear dates
              </button>
            )}
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              {filteredEntries.length} entries in range
            </span>
          </div>
        )}
      </div>

      {/* ── Conversion funnel ── */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Conversion Funnel</h2>
        </div>
        <div className="flex items-start gap-1 sm:gap-2">
          <FunnelStep label="DQ" value={totals.dq} color="text-blue-600 dark:text-blue-400" />
          <FunnelArrow />
          <FunnelStep
            label="Referrals"
            value={totals.referrals}
            pct={pct(totals.referrals, totals.dq)}
            color="text-purple-600 dark:text-purple-400"
          />
          <FunnelArrow />
          <FunnelStep
            label="Appointments"
            value={totals.appointments}
            pct={pct(totals.appointments, totals.dq)}
            color="text-amber-600 dark:text-amber-400"
          />
          <FunnelArrow />
          <FunnelStep
            label="Presentations"
            value={totals.presentations}
            pct={pct(totals.presentations, totals.appointments)}
            color="text-orange-600 dark:text-orange-400"
          />
          <FunnelArrow />
          <FunnelStep
            label="Sold"
            value={totals.sold}
            pct={pct(totals.sold, totals.presentations)}
            color="text-green-600 dark:text-green-400"
          />
        </div>
        {/* Overall DQ → Sold conversion */}
        {totals.dq > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-white/[0.06] flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Overall DQ → Sold conversion:</span>
            <span
              className={`font-bold text-sm ${
                totals.sold / totals.dq >= 0.1
                  ? "text-green-600 dark:text-green-400"
                  : totals.sold / totals.dq >= 0.05
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-500 dark:text-red-400"
              }`}
            >
              {pct(totals.sold, totals.dq)}%
            </span>
          </div>
        )}
      </div>

      {/* ── Summary cards ── */}
      {/* Row 1: Main pipeline */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {[
          { label: "DQ", value: totals.dq, color: "text-blue-600 dark:text-blue-400" },
          { label: "Referrals", value: totals.referrals, color: "text-purple-600 dark:text-purple-400" },
          { label: "Appointments", value: totals.appointments, color: "text-amber-600 dark:text-amber-400" },
          { label: "Presentations", value: totals.presentations, color: "text-orange-600 dark:text-orange-400" },
          { label: "Sold", value: totals.sold, color: "text-green-600 dark:text-green-400" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 text-center"
          >
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-tight">{label}</div>
          </div>
        ))}
      </div>
      {/* Row 2: FC / FR breakdown */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: "FC Appts", value: totals.fcAppts, color: "text-indigo-600 dark:text-indigo-400", sub: "FC" },
          {
            label: "FC Presented",
            value: totals.fcPresented,
            color: "text-indigo-600 dark:text-indigo-400",
            sub: "FC",
          },
          { label: "FC Booked", value: totals.fcBooked, color: "text-indigo-700 dark:text-indigo-300", sub: "FC" },
          { label: "FR Appts", value: totals.frAppts, color: "text-teal-600 dark:text-teal-400", sub: "FR" },
          { label: "FR Presented", value: totals.frPresented, color: "text-teal-600 dark:text-teal-400", sub: "FR" },
          { label: "FR Booked", value: totals.frBooked, color: "text-teal-700 dark:text-teal-300", sub: "FR" },
        ].map(({ label, value, color, sub }) => (
          <div
            key={label}
            className={`bg-white dark:bg-[var(--surface)] rounded-xl border p-3 text-center ${
              sub === "FC" ? "border-indigo-200 dark:border-indigo-800/60" : "border-teal-200 dark:border-teal-800/60"
            }`}
          >
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Per-rep leaderboard ── */}
      {leaderboard.length > 0 && (
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-white/[0.06] flex items-center gap-2">
            <Trophy size={15} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Rep Leaderboard</h2>
            <span className="text-xs text-gray-400 ml-1">— {rangeLabels[dateRange]}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[var(--surface)]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Rep</th>
                  {(
                    [
                      ["dq", "DQ"],
                      ["referrals", "Refs"],
                      ["appointments", "Appts"],
                      ["presentations", "Pres"],
                      ["sold", "Sold"],
                      ["fcBooked", "FC Booked"],
                      ["frBooked", "FR Booked"],
                    ] as [LeaderboardSort, string][]
                  ).map(([col, label]) => (
                    <th
                      key={col}
                      className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap transition ${
                        lbSort === col
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                      }`}
                      onClick={() => toggleLbSort(col)}
                    >
                      {label} <SortIcon col={col} />
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    vs Target
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {leaderboard.map((rep, idx) => {
                  const isTop3 = idx < 3;
                  return (
                    <tr
                      key={rep.repId}
                      className={`transition ${isTop3 ? rankBg[idx] : "hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50"}`}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={`text-sm font-bold ${isTop3 ? rankColors[idx] : "text-gray-400 dark:text-gray-500"}`}
                        >
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900 dark:text-white whitespace-nowrap">{rep.repName}</div>
                        <div className="text-xs text-gray-400">
                          {rep.entries} {rep.entries === 1 ? "day" : "days"}
                        </div>
                      </td>
                      <td className="px-3 py-2 min-w-[100px]">
                        <MiniBar value={rep.dq} max={lbMax.dq} color="bg-gray-500" />
                      </td>
                      <td className="px-3 py-2 min-w-[80px]">
                        <MiniBar value={rep.referrals} max={lbMax.referrals} color="bg-purple-500" />
                      </td>
                      <td className="px-3 py-2 min-w-[80px]">
                        <MiniBar value={rep.appointments} max={lbMax.appointments} color="bg-amber-500" />
                      </td>
                      <td className="px-3 py-2 min-w-[80px]">
                        <MiniBar value={rep.presentations} max={lbMax.presentations} color="bg-orange-500" />
                      </td>
                      <td className="px-3 py-2 min-w-[80px]">
                        <MiniBar value={rep.sold} max={lbMax.sold} color="bg-green-500" />
                      </td>
                      <td className="px-3 py-2 min-w-[80px]">
                        <MiniBar value={rep.fcBooked} max={lbMax.fcBooked} color="bg-gray-500" />
                      </td>
                      <td className="px-3 py-2 min-w-[80px]">
                        <MiniBar value={rep.frBooked} max={lbMax.frBooked} color="bg-teal-500" />
                      </td>
                      <td className="px-3 py-2 min-w-[140px]">
                        {settings?.repTargets?.[rep.repId] ? (
                          <div>
                            <TargetBar
                              label="Wk DQ"
                              value={repDQProgress.get(rep.repId)?.weeklyDQ ?? 0}
                              target={settings.repTargets[rep.repId]?.weeklyDQ ?? 0}
                            />
                            <TargetBar
                              label="Mo DQ"
                              value={repDQProgress.get(rep.repId)?.monthlyDQ ?? 0}
                              target={settings.repTargets[rep.repId]?.monthlyDQ ?? 0}
                              color="bg-gray-500"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">No targets set</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── History (grouped by date) ── */}
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            History <span className="font-normal text-gray-400">({filteredEntries.length})</span>
          </h2>
          <span className="text-xs text-gray-400">{rangeLabels[dateRange]}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : groupedHistory.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
            No DRAPS entries for this period
          </div>
        ) : (
          <div>
            {groupedHistory.map(({ date, rows, totals: gt }) => {
              const collapsed = collapsedDates.has(date);
              return (
                <div key={date} className="border-b border-gray-100 dark:border-white/[0.06] last:border-b-0">
                  {/* Date group header */}
                  <button
                    className="w-full flex items-center gap-3 px-5 py-2.5 bg-gray-50 dark:bg-[var(--surface)]/60 hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition text-left"
                    onClick={() => toggleDate(date)}
                  >
                    {collapsed ? (
                      <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronUp size={13} className="text-gray-400 flex-shrink-0" />
                    )}
                    <div className="flex items-center gap-2 flex-1">
                      <Calendar size={12} className="text-amber-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{fmtDate(date)}</span>
                      <span className="text-xs text-gray-400">
                        {rows.length} {rows.length === 1 ? "entry" : "entries"}
                      </span>
                    </div>
                    {/* Quick totals in header */}
                    <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {gt.dq > 0 && <span className="text-blue-600 dark:text-blue-400 font-medium">{gt.dq} DQ</span>}
                      {gt.appointments > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">{gt.appointments} Appts</span>
                      )}
                      {gt.sold > 0 && (
                        <span className="text-green-600 dark:text-green-400 font-medium">{gt.sold} Sold</span>
                      )}
                    </div>
                  </button>

                  {/* Rows */}
                  {!collapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-white/[0.06]">
                          <tr>
                            {[
                              "Rep",
                              "DQ",
                              "Refs",
                              "Appts",
                              "Pres",
                              "Sold",
                              "FC Appts",
                              "FC Pres",
                              "FC Booked",
                              "FR Appts",
                              "FR Pres",
                              "FR Booked",
                              "",
                            ].map((h) => (
                              <th
                                key={h}
                                className="px-3 py-1.5 text-left text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide whitespace-nowrap"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                          {rows.map((e) => (
                            <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-[var(--hover)]/40 transition">
                              <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900 dark:text-white">
                                {e.repName}
                              </td>
                              <td className="px-3 py-2 text-center font-semibold text-blue-600 dark:text-blue-400">
                                {e.dq}
                              </td>
                              <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{e.referrals}</td>
                              <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
                                {e.appointments}
                              </td>
                              <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
                                {e.presentations}
                              </td>
                              <td className="px-3 py-2 text-center font-semibold text-green-600 dark:text-green-400">
                                {e.sold}
                              </td>
                              <td className="px-3 py-2 text-center text-gray-400">{e.fcAppts}</td>
                              <td className="px-3 py-2 text-center text-gray-400">{e.fcPresented}</td>
                              <td className="px-3 py-2 text-center text-gray-400">{e.fcBooked}</td>
                              <td className="px-3 py-2 text-center text-gray-400">{e.frAppts}</td>
                              <td className="px-3 py-2 text-center text-gray-400">{e.frPresented}</td>
                              <td className="px-3 py-2 text-center text-gray-400">{e.frBooked}</td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => handleDelete(e.id)}
                                  className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition rounded"
                                  title="Delete entry"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {/* Per-day totals row (only if > 1 entry) */}
                        {rows.length > 1 && (
                          <tfoot>
                            <tr className="bg-gray-50 dark:bg-[var(--surface)]/60 font-semibold text-xs">
                              <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                Day Total
                              </td>
                              <td className="px-3 py-1.5 text-center text-blue-600 dark:text-blue-400">{gt.dq}</td>
                              <td className="px-3 py-1.5 text-center text-gray-500 dark:text-gray-400">
                                {gt.referrals}
                              </td>
                              <td className="px-3 py-1.5 text-center text-gray-500 dark:text-gray-400">
                                {gt.appointments}
                              </td>
                              <td className="px-3 py-1.5 text-center text-gray-500 dark:text-gray-400">
                                {gt.presentations}
                              </td>
                              <td className="px-3 py-1.5 text-center text-green-600 dark:text-green-400">{gt.sold}</td>
                              <td colSpan={7} />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default DrapsPage;
