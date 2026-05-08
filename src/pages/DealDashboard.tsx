/**
 * DealDashboard.tsx — Deals Hub (Enhanced)
 *
 * Features:
 *  - Chase List (stuck deals) + At Risk intelligence
 *  - Unified activity timeline (deal.notes + lead.callHistory)
 *  - Last Contact + Next Action columns
 *  - Commission percent in drawer financials
 *  - Completed deals summary stats
 *  - Inline quick edit (commissionPaid, settlementDate)
 *  - Responsive: card list on mobile, full table on desktop
 *  - Drawer: full-screen modal on mobile, right panel on desktop
 *  - Touch-optimised (min 44px tap targets)
 *  - Single Firestore fetch; leads fetched only when drawer opens
 *
 * Configurable thresholds:
 *  STUCK_DAYS = 7  — days since lastUpdate before "stuck"
 *  AT_RISK_DAYS = 7 — days until settlement before "at risk"
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAppStore } from "../stores/appStore";
import { useAppSettings } from "../hooks/useAppSettings";
import { useDealDocuments, useDeals } from "../hooks/useFirebase";
import { useToast } from "../context/ToastContext";
import { Rep, Lead, DealDocumentType, DealDocument } from "../types";
import { OADocumentEditor } from "../components/OADocumentEditor";
import {
  Search,
  X,
  ChevronDown,
  DollarSign,
  Calendar,
  User,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Plus,
  Loader,
  ArrowUp,
  ArrowDown,
  Clock,
  Phone,
  AlertCircle,
  History,
  Edit2,
  Eye,
  Target,
  Briefcase,
  Download,
  FileText,
  Upload,
  Trash2,
  File,
  Shield,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Configurable thresholds (loaded from Firestore via useAppSettings)
// These module-level fallbacks are only used during the brief loading window.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_STUCK_DAYS = 7;
const DEFAULT_AT_RISK_DAYS = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DealStatus = "lead" | "conditional" | "unconditional" | "settled" | "lost";

export interface DealNote {
  id: string;
  text: string;
  createdAt: number;
  createdBy: string;
  createdById: number;
}

export interface Deal {
  id: string;
  leadId?: string;
  clientName: string;
  status: DealStatus;
  dealValue: number;
  commissionTotal: number;
  commissionPaid: number;
  expectedSettlementDate: string;
  contractSignedDate?: string;
  financeApprovedDate?: string;
  assignedTo: number;
  lastUpdate: number;
  notes: DealNote[];
  createdAt: number;
  createdBy: string;
}

export interface TimelineEntry {
  id: string;
  type: "note" | "call" | "status_change";
  text: string;
  timestamp: number;
  userName: string;
  meta?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useLinkedLead(leadId: string | null) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!leadId) {
      setLead(null);
      return;
    }
    setLoading(true);
    getDoc(doc(db, "leads", leadId))
      .then((snap) => {
        setLead(snap.exists() ? ({ id: Number(snap.id), ...snap.data() } as Lead) : null);
        setLoading(false);
      })
      .catch(() => {
        setLead(null);
        setLoading(false);
      });
  }, [leadId]);
  return { lead, loading };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

const fmtTs = (ts: number) =>
  new Date(ts).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const daysUntil = (s: string) => {
  if (!s) return Infinity;
  return Math.ceil((new Date(s + "T00:00:00").getTime() - Date.now()) / 86_400_000);
};

const daysSince = (ts: number) => Math.floor((Date.now() - ts) / 86_400_000);

const repName = (id: number | undefined, reps: Rep[]) => {
  if (!id) return "Unassigned";
  return reps.find((r) => r.id === id)?.name ?? "Unknown";
};

// ─────────────────────────────────────────────────────────────────────────────
// Status Config
// ─────────────────────────────────────────────────────────────────────────────

const STAGES: DealStatus[] = ["lead", "conditional", "unconditional", "settled", "lost"];

const ST: Record<DealStatus, { label: string; bg: string; text: string; border: string; dot: string }> = {
  lead: {
    label: "Lead",
    bg: "bg-gray-100 dark:bg-gray-800/40",
    text: "text-gray-700 dark:text-gray-300",
    border: "border-gray-200 dark:border-gray-700",
    dot: "bg-gray-400",
  },
  conditional: {
    label: "Conditional",
    bg: "bg-orange-100 dark:bg-orange-900/40",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
    dot: "bg-orange-400",
  },
  unconditional: {
    label: "Unconditional",
    bg: "bg-purple-100 dark:bg-purple-900/40",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800",
    dot: "bg-purple-400",
  },
  settled: {
    label: "Settled",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-400",
  },
  lost: {
    label: "Lost",
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-400",
  },
};

const isComplete = (s: DealStatus) => s === "settled" || s === "lost";
const isActive = (s: DealStatus) => !isComplete(s);

// ─────────────────────────────────────────────────────────────────────────────
// Intelligence Flags
// ─────────────────────────────────────────────────────────────────────────────

interface Flags {
  isStuck: boolean;
  isAtRisk: boolean;
  stuckDays: number;
  riskDays: number;
  overdue: boolean;
  overdueDays: number;
}

function getFlags(d: Deal, stuckDays: number = DEFAULT_STUCK_DAYS, atRiskDays: number = DEFAULT_AT_RISK_DAYS): Flags {
  const done = isComplete(d.status);
  const ds = daysSince(d.lastUpdate);
  const du = daysUntil(d.expectedSettlementDate);
  return {
    isStuck: !done && ds > stuckDays,
    isAtRisk: !done && ds > stuckDays && du >= 0 && du <= atRiskDays,
    stuckDays: !done && ds > stuckDays ? ds : 0,
    riskDays: !done && ds > stuckDays && du >= 0 && du <= atRiskDays ? du : 0,
    overdue: !done && du < 0,
    overdueDays: !done && du < 0 ? Math.abs(du) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Next Action (priority order)
// ─────────────────────────────────────────────────────────────────────────────

function getNextAction(
  deal: Deal,
  lead: Lead | null,
): { label: string; urgency: "urgent" | "high" | "medium" | "low" | "" } {
  const f = getFlags(deal);
  if (lead?.callbackDate && lead.callbackTime) return { label: `Call at ${lead.callbackTime}`, urgency: "high" };
  if (f.isAtRisk) return { label: "URGENT", urgency: "urgent" };
  if (f.isStuck) return { label: "Follow up", urgency: "medium" };
  if (!lead?.callHistory || lead.callHistory.length === 0) return { label: "Call", urgency: "high" };
  return { label: "", urgency: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// StatsBar
// ─────────────────────────────────────────────────────────────────────────────

function StatsBar({ deals }: { deals: Deal[] }) {
  const stats = useMemo(() => {
    const active = deals.filter((d) => isActive(d.status));
    const settled = deals.filter((d) => d.status === "settled");
    const lost = deals.filter((d) => d.status === "lost");
    const now = new Date();
    const thisMonth = settled.filter((d) => {
      const dt = new Date(d.expectedSettlementDate + "T00:00:00");
      return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    });
    return {
      activeCount: active.length,
      pipelineValue: active.reduce((s, d) => s + (d.dealValue || 0), 0),
      expectedCommission: active.reduce((s, d) => s + (d.commissionTotal || 0), 0),
      outstanding: active.reduce((s, d) => s + Math.max(0, (d.commissionTotal || 0) - (d.commissionPaid || 0)), 0),
      settledCount: thisMonth.length,
      settledValue: thisMonth.reduce((s, d) => s + (d.dealValue || 0), 0),
      lostCount: lost.length,
    };
  }, [deals]);

  const cards = [
    {
      label: "Active Deals",
      value: String(stats.activeCount),
      icon: <TrendingUp size={18} className="text-blue-600 dark:text-blue-400" />,
      grad: "bg-blue-50 dark:bg-blue-900/20",
      brd: "border-blue-100 dark:border-blue-900/40",
    },
    {
      label: "Pipeline Value",
      value: fmt(stats.pipelineValue),
      icon: <DollarSign size={18} className="text-emerald-600 dark:text-emerald-400" />,
      grad: "bg-emerald-50 dark:bg-emerald-900/20",
      brd: "border-emerald-100 dark:border-emerald-900/40",
    },
    {
      label: "Expected Comm.",
      value: fmt(stats.expectedCommission),
      icon: <DollarSign size={18} className="text-amber-600 dark:text-amber-400" />,
      grad: "bg-amber-50 dark:bg-amber-900/20",
      brd: "border-amber-100 dark:border-amber-900/40",
    },
    {
      label: "Outstanding",
      value: fmt(stats.outstanding),
      icon: <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />,
      grad: "bg-red-50 dark:bg-red-900/20",
      brd: "border-red-100 dark:border-red-900/40",
    },
    {
      label: "Settled (Month)",
      value: `${stats.settledCount}`,
      sub: stats.settledCount > 0 ? fmt(stats.settledValue) : undefined,
      icon: <CheckCircle size={18} className="text-green-600 dark:text-green-400" />,
      grad: "bg-green-50 dark:bg-green-900/20",
      brd: "border-green-100 dark:border-green-900/40",
    },
    {
      label: "Lost",
      value: String(stats.lostCount),
      icon: <X size={18} className="text-slate-500 dark:text-slate-400" />,
      grad: "bg-slate-50 dark:bg-slate-800/30",
      brd: "border-slate-200 dark:border-slate-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-xl border ${c.brd} ${c.grad} p-3 sm:p-4 shadow-sm`}>
          <div className="flex items-start justify-between mb-2">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${c.grad}`}>
              {c.icon}
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-none mb-1 tabular-nums">
            {c.value}
          </div>
          <div className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {c.label}
          </div>
          {c.sub && (
            <div className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium tabular-nums">
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StageBreakdown (incl. Chase + At Risk)
// ─────────────────────────────────────────────────────────────────────────────

type StageFilter = DealStatus | "all" | "chase" | "at-risk";

function StageBreakdown({
  deals,
  selected,
  onSelect,
  stuckDays = DEFAULT_STUCK_DAYS,
  atRiskDays = DEFAULT_AT_RISK_DAYS,
}: {
  deals: Deal[];
  selected: StageFilter;
  onSelect: (s: StageFilter) => void;
  stuckDays?: number;
  atRiskDays?: number;
}) {
  const stageData = useMemo(
    () =>
      STAGES.map((s) => ({
        status: s,
        count: deals.filter((d) => d.status === s).length,
        value: deals.filter((d) => d.status === s).reduce((sum, d) => sum + (d.dealValue || 0), 0),
      })),
    [deals],
  );

  const chaseDeals = useMemo(
    () =>
      deals.filter(
        (d) =>
          isActive(d.status) &&
          getFlags(d, stuckDays, atRiskDays).isStuck &&
          !getFlags(d, stuckDays, atRiskDays).isAtRisk,
      ),
    [deals, stuckDays, atRiskDays],
  );
  const atRiskDeals = useMemo(
    () => deals.filter((d) => getFlags(d, stuckDays, atRiskDays).isAtRisk),
    [deals, stuckDays, atRiskDays],
  );

  const items: { key: StageFilter; label: string; count: number; value: number; dot?: string; danger?: string }[] = [
    { key: "all", label: "All", count: deals.length, value: deals.reduce((s, d) => s + (d.dealValue || 0), 0) },
    // Action items first
    {
      key: "at-risk",
      label: "At Risk",
      count: atRiskDeals.length,
      value: atRiskDeals.reduce((s, d) => s + (d.dealValue || 0), 0),
      dot: "bg-red-500",
      danger: "text-red-700 dark:text-red-300",
    },
    {
      key: "chase",
      label: "Chase",
      count: chaseDeals.length,
      value: chaseDeals.reduce((s, d) => s + (d.dealValue || 0), 0),
      dot: "bg-amber-400",
    },
    // Pipeline stages
    ...stageData.map((sd) => ({
      key: sd.status as StageFilter,
      label: ST[sd.status].label,
      count: sd.count,
      value: sd.value,
      dot: ST[sd.status].dot,
    })),
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
      {items.map((item) => {
        const active = selected === item.key;
        const textColor = item.danger || "text-gray-900 dark:text-white";
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`rounded-xl border p-3 sm:p-4 text-left transition min-h-[44px] ${
              active
                ? item.key === "at-risk"
                  ? "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20 ring-1 ring-red-400/30"
                  : item.key === "chase"
                    ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-400/30"
                    : "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-400/30"
                : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
            } shadow-sm`}
          >
            <div className="flex items-center gap-2 mb-1">
              {item.dot && <span className={`w-2.5 h-2.5 rounded-full ${item.dot}`} />}
              <span className={`text-sm font-bold ${item.danger || "text-gray-900 dark:text-white"}`}>
                {item.label}
              </span>
            </div>
            <div className={`text-xl sm:text-2xl font-bold tabular-nums ${textColor}`}>{item.count}</div>
            <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
              {fmt(item.value)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DealCard (mobile view)
// ─────────────────────────────────────────────────────────────────────────────

function DealCard({
  deal,
  lead,
  reps,
  onOpen,
  stuckDays = DEFAULT_STUCK_DAYS,
  atRiskDays = DEFAULT_AT_RISK_DAYS,
}: {
  deal: Deal;
  lead: Lead | null;
  reps: Rep[];
  onOpen: (d: Deal) => void;
  stuckDays?: number;
  atRiskDays?: number;
}) {
  const f = getFlags(deal, stuckDays, atRiskDays);
  const na = getNextAction(deal, lead);
  const lastCall =
    lead?.callHistory && lead.callHistory.length > 0 ? lead.callHistory[lead.callHistory.length - 1] : null;

  return (
    <button
      onClick={() => onOpen(deal)}
      className={`w-full text-left rounded-xl border p-4 shadow-sm transition min-h-[44px] ${
        f.isAtRisk
          ? "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10"
          : f.isStuck
            ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10"
            : f.overdue
              ? "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/5"
              : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900 dark:text-white truncate">{deal.clientName}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={badge(deal.status)}>{ST[deal.status].label}</span>
            {f.isAtRisk && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                <AlertTriangle size={10} />
                At Risk
              </span>
            )}
            {f.isStuck && !f.isAtRisk && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                <Clock size={10} />
                {f.stuckDays}d
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{fmt(deal.dealValue)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <User size={12} />
          {repName(deal.assignedTo, reps)}
        </div>
        <div className="flex items-center gap-1">
          <Calendar size={12} />
          {fmtDate(deal.expectedSettlementDate)}
        </div>
      </div>
      {na.label && (
        <div
          className={`mt-2 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold ${
            na.urgency === "urgent"
              ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
              : na.urgency === "high"
                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                : na.urgency === "medium"
                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
          }`}
        >
          {na.urgency === "urgent" ? <AlertTriangle size={9} /> : <Target size={9} />}
          {na.label}
        </div>
      )}
      {lastCall && (
        <div className="mt-1 text-[10px] text-gray-400">
          Last: {lastCall.date} — {(lastCall.result || "").replace(/_/g, " ")}
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DealRow (desktop table)
// ─────────────────────────────────────────────────────────────────────────────

function DealRow({
  deal,
  lead,
  reps,
  onOpen,
  onStatusChange,
  onUpdateField,
  stuckDays = DEFAULT_STUCK_DAYS,
  atRiskDays = DEFAULT_AT_RISK_DAYS,
}: {
  deal: Deal;
  lead: Lead | null;
  reps: Rep[];
  onOpen: (d: Deal) => void;
  onStatusChange: (id: string, s: DealStatus) => void;
  onUpdateField: (id: string, field: string, value: unknown) => void;
  stuckDays?: number;
  atRiskDays?: number;
}) {
  const { showToast } = useToast();
  const [statusOpen, setStatusOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editCommPaid, setEditCommPaid] = useState(deal.commissionPaid);
  const [editDate, setEditDate] = useState(deal.expectedSettlementDate);
  const [editingPaid, setEditingPaid] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const f = getFlags(deal, stuckDays, atRiskDays);
  const du = daysUntil(deal.expectedSettlementDate);
  const dueSoon = du >= 0 && du <= atRiskDays && !f.overdue;
  const na = getNextAction(deal, lead);
  const lastCall =
    lead?.callHistory && lead.callHistory.length > 0 ? lead.callHistory[lead.callHistory.length - 1] : null;

  useEffect(() => {
    setEditCommPaid(deal.commissionPaid);
  }, [deal.commissionPaid]);
  useEffect(() => {
    setEditDate(deal.expectedSettlementDate);
  }, [deal.expectedSettlementDate]);

  const rowBg = f.isAtRisk
    ? "bg-red-50/70 dark:bg-red-900/10"
    : f.isStuck
      ? "bg-amber-50/60 dark:bg-amber-900/10"
      : f.overdue
        ? "bg-red-50/40 dark:bg-red-900/5"
        : "";

  useEffect(() => {
    if (!statusOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statusOpen]);

  const handleStatus = async (e: React.MouseEvent, ns: DealStatus) => {
    e.stopPropagation();
    if (ns === deal.status || saving) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "deals", deal.id), { status: ns, lastUpdate: Date.now() });
      showToast(`✅ Status → ${ST[ns].label}`, "success");
      onStatusChange(deal.id, ns);
    } catch {
      showToast("❌ Failed to update status", "error");
    } finally {
      setSaving(false);
      setStatusOpen(false);
    }
  };

  const saveCommPaid = async () => {
    if (editCommPaid === deal.commissionPaid) {
      setEditingPaid(false);
      return;
    }
    await onUpdateField(deal.id, "commissionPaid", editCommPaid);
    setEditingPaid(false);
  };

  const saveDate = async () => {
    if (editDate === deal.expectedSettlementDate) {
      setEditingDate(false);
      return;
    }
    await onUpdateField(deal.id, "expectedSettlementDate", editDate);
    setEditingDate(false);
  };

  return (
    <tr
      onClick={() => onOpen(deal)}
      className={`border-b border-gray-100 dark:border-white/[0.06] hover:bg-gray-50 dark:hover:bg-[var(--hover)] cursor-pointer transition-colors ${rowBg}`}
    >
      {/* Status */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <div ref={dropRef} className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setStatusOpen(!statusOpen);
              }}
              disabled={saving}
              className={`${badge(deal.status)} hover:opacity-80 transition disabled:opacity-50 min-h-[28px]`}
            >
              {saving ? (
                <Loader size={12} className="animate-spin" />
              ) : (
                <>
                  <span className={`w-1.5 h-1.5 rounded-full ${ST[deal.status].dot}`} />
                  {ST[deal.status].label}
                  <ChevronDown size={11} />
                </>
              )}
            </button>
            {statusOpen && (
              <div className="absolute z-30 mt-1 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-lg shadow-lg min-w-[160px] overflow-hidden">
                {STAGES.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => handleStatus(e, s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] flex items-center gap-2 transition min-h-[44px]"
                  >
                    <span className={badge(s)}>{ST[s].label}</span>
                    {s === deal.status && <CheckCircle size={13} className="text-green-500 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {f.isAtRisk && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
              title="At Risk"
            >
              <AlertTriangle size={10} />
              At Risk
            </span>
          )}
          {f.isStuck && !f.isAtRisk && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
              title={`${f.stuckDays}d stuck`}
            >
              <Clock size={10} />
              {f.stuckDays}d
            </span>
          )}
          {f.overdue && !f.isAtRisk && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
              title={`${f.overdueDays}d overdue`}
            >
              <AlertTriangle size={10} />
              {f.overdueDays}d
            </span>
          )}
        </div>
      </td>
      {/* Client */}
      <td className="px-3 py-2.5">
        <span className="font-medium text-sm text-gray-900 dark:text-white">{deal.clientName}</span>
      </td>
      {/* Value */}
      <td className="px-3 py-2.5 hidden lg:table-cell">
        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(deal.dealValue)}</span>
      </td>
      {/* Commission */}
      <td className="px-3 py-2.5 hidden xl:table-cell">
        <div className="text-xs space-y-0.5">
          <div className="text-gray-600 dark:text-gray-400 tabular-nums">
            T: <span className="font-semibold text-gray-900 dark:text-white">{fmt(deal.commissionTotal)}</span>
          </div>
          {editingPaid ? (
            <input
              type="number"
              value={editCommPaid}
              onChange={(e) => setEditCommPaid(Number(e.target.value))}
              onBlur={saveCommPaid}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCommPaid();
                if (e.key === "Escape") {
                  setEditCommPaid(deal.commissionPaid);
                  setEditingPaid(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-20 px-1 py-0.5 text-xs rounded border border-amber-400 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-amber-400"
              autoFocus
            />
          ) : (
            <div
              className="text-green-600 dark:text-green-400 tabular-nums flex items-center gap-1 cursor-pointer min-h-[20px]"
              onClick={(e) => {
                e.stopPropagation();
                setEditingPaid(true);
              }}
            >
              P: {fmt(deal.commissionPaid)} <Edit2 size={8} className="opacity-50" />
            </div>
          )}
          {deal.commissionTotal - deal.commissionPaid > 0 && (
            <div className="text-amber-600 dark:text-amber-400 tabular-nums">
              O: {fmt(deal.commissionTotal - deal.commissionPaid)}
            </div>
          )}
        </div>
      </td>
      {/* Settlement */}
      <td className="px-3 py-2.5 hidden md:table-cell">
        {editingDate ? (
          <input
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            onBlur={saveDate}
            onClick={(e) => e.stopPropagation()}
            className="px-1 py-0.5 text-xs rounded border border-amber-400 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            autoFocus
          />
        ) : (
          <div
            className={`text-sm cursor-pointer min-h-[20px] ${f.isAtRisk ? "text-red-600 dark:text-red-400 font-semibold" : f.overdue ? "text-red-600 dark:text-red-400 font-semibold" : dueSoon ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-gray-700 dark:text-gray-300"}`}
            onClick={(e) => {
              e.stopPropagation();
              setEditingDate(true);
            }}
          >
            {fmtDate(deal.expectedSettlementDate)}
            {!f.isAtRisk && !f.overdue && du < Infinity && (
              <div className="text-[10px] text-gray-400 mt-0.5">{du === 0 ? "Today" : `in ${du}d`}</div>
            )}
          </div>
        )}
      </td>
      {/* Last Contact */}
      <td className="px-3 py-2.5 hidden xl:table-cell">
        {lastCall ? (
          <div className="text-xs">
            <div className="text-gray-700 dark:text-gray-300 tabular-nums">{lastCall.date}</div>
            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400">
              {lastCall.result?.replace(/_/g, " ")}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      {/* Next Action */}
      <td className="px-3 py-2.5 hidden sm:table-cell">
        {na.label ? (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              na.urgency === "urgent"
                ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                : na.urgency === "high"
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                  : na.urgency === "medium"
                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            }`}
          >
            {na.urgency === "urgent" ? (
              <AlertTriangle size={9} />
            ) : na.urgency === "high" ? (
              <Phone size={9} />
            ) : (
              <Target size={9} />
            )}
            {na.label}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      {/* Assigned */}
      <td className="px-3 py-2.5 hidden lg:table-cell">
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <User size={14} className="text-gray-400 flex-shrink-0" />
          <span className="truncate">{repName(deal.assignedTo, reps)}</span>
        </div>
      </td>
      {/* Actions */}
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onOpen(deal)}
          className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition min-h-[44px] min-w-[44px] justify-center"
        >
          <Eye size={14} />
          <span className="hidden sm:inline">Open</span>
        </button>
      </td>
    </tr>
  );
}

function badge(s: DealStatus) {
  const c = ST[s];
  return `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DealDrawer (responsive: full-screen on mobile, right panel on desktop)
// ─────────────────────────────────────────────────────────────────────────────

function DealDrawer({
  deal,
  reps,
  currentUser,
  onClose,
  onUpdate,
  stuckDays = DEFAULT_STUCK_DAYS,
  atRiskDays = DEFAULT_AT_RISK_DAYS,
}: {
  deal: Deal;
  reps: Rep[];
  currentUser: Rep | null;
  onClose: () => void;
  onUpdate: () => void;
  stuckDays?: number;
  atRiskDays?: number;
}) {
  const { showToast } = useToast();
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editValue, setEditValue] = useState(deal.dealValue);
  const [editCommTotal, setEditCommTotal] = useState(deal.commissionTotal);
  const [editCommPaid, setEditCommPaid] = useState(deal.commissionPaid);
  const [savingFinancials, setSavingFinancials] = useState(false);

  const { lead } = useLinkedLead(deal.leadId || null);
  useEffect(() => {
    setEditValue(deal.dealValue);
    setEditCommTotal(deal.commissionTotal);
    setEditCommPaid(deal.commissionPaid);
  }, [deal]);

  const f = getFlags(deal, stuckDays, atRiskDays);
  const du = daysUntil(deal.expectedSettlementDate);
  const outstanding = Math.max(0, editCommTotal - editCommPaid);
  const commPct = editCommTotal > 0 && editValue > 0 ? ((editCommTotal / editValue) * 100).toFixed(1) : "0";
  const na = getNextAction(deal, lead);
  const lastCall =
    lead?.callHistory && lead.callHistory.length > 0 ? lead.callHistory[lead.callHistory.length - 1] : null;

  const handleStatusChange = async (ns: DealStatus) => {
    if (ns === deal.status) return;
    try {
      await updateDoc(doc(db, "deals", deal.id), { status: ns, lastUpdate: Date.now() });
      showToast(`✅ Status → ${ST[ns].label}`, "success");
      setStatusOpen(false);
      onUpdate();
    } catch {
      showToast("❌ Failed to update status", "error");
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !currentUser) return;
    setSaving(true);
    try {
      const note: DealNote = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: noteText.trim(),
        createdAt: Date.now(),
        createdBy: currentUser.name,
        createdById: currentUser.id,
      };
      await updateDoc(doc(db, "deals", deal.id), { notes: [...(deal.notes || []), note], lastUpdate: Date.now() });
      setNoteText("");
      showToast("✅ Note added", "success");
      onUpdate();
    } catch {
      showToast("❌ Failed to add note", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFinancials = async () => {
    setSavingFinancials(true);
    try {
      await updateDoc(doc(db, "deals", deal.id), {
        dealValue: editValue,
        commissionTotal: editCommTotal,
        commissionPaid: editCommPaid,
        lastUpdate: Date.now(),
      });
      showToast("✅ Financials updated", "success");
      onUpdate();
    } catch {
      showToast("❌ Failed to update financials", "error");
    } finally {
      setSavingFinancials(false);
    }
  };

  // Unified timeline
  const timeline: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [];
    (deal.notes || []).forEach((n) =>
      entries.push({ id: n.id, type: "note", text: n.text, timestamp: n.createdAt, userName: n.createdBy }),
    );
    if (lead?.callHistory) {
      lead.callHistory.forEach((c, i) =>
        entries.push({
          id: `call_${i}_${c.date}`,
          type: "call",
          text: c.notes || c.result || "",
          timestamp: new Date(`${c.date}T${c.time || "00:00"}`).getTime() || 0,
          userName: c.rep || "Unknown",
          meta: (c.result || "").replace(/_/g, " "),
        }),
      );
    }
    entries.push({
      id: `created_${deal.id}`,
      type: "status_change",
      text: `Deal created (${ST[deal.status]?.label || deal.status})`,
      timestamp: deal.createdAt,
      userName: deal.createdBy,
      meta: "origin",
    });
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }, [deal, lead]);

  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[44px]";

  return (
    <>
      {/* Overlay (mobile full-screen, desktop partial) */}
      <div className="fixed inset-0 bg-black/40 z-50 md:bg-black/40" onClick={onClose} />
      {/* Drawer: full-screen on mobile, right panel on desktop */}
      <div className="fixed inset-0 z-50 md:inset-y-0 md:right-0 md:w-full md:max-w-[540px] bg-white dark:bg-[var(--surface)] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="relative">
                <button
                  onClick={() => setStatusOpen(!statusOpen)}
                  className={`${badge(deal.status)} hover:opacity-80 transition min-h-[32px]`}
                >
                  {ST[deal.status].label}
                  <ChevronDown size={12} />
                </button>
                {statusOpen && (
                  <div className="absolute z-30 mt-1 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-lg shadow-lg min-w-[180px] overflow-hidden">
                    {STAGES.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] flex items-center gap-2 transition min-h-[44px]"
                      >
                        <span className={badge(s)}>{ST[s].label}</span>
                        {s === deal.status && <CheckCircle size={13} className="text-green-500 ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {f.isAtRisk && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                  <AlertTriangle size={10} />
                  At Risk
                </span>
              )}
              {f.isStuck && !f.isAtRisk && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                  <Clock size={10} />
                  {f.stuckDays}d stuck
                </span>
              )}
              {f.overdue && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                  <AlertTriangle size={10} />
                  {f.overdueDays}d overdue
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">{deal.clientName}</h2>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">
              Assigned to {repName(deal.assignedTo, reps)} · Created {fmtTs(deal.createdAt)}
              {lastCall && (
                <>
                  <br />
                  Last contact: {lastCall.date} —{" "}
                  <span className="font-medium">{(lastCall.result || "").replace(/_/g, " ")}</span>
                </>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-400 ml-2 flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 sm:py-4 space-y-4 sm:space-y-5">
          {/* Progress */}
          <div>
            <h3 className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <TrendingUp size={14} /> Progress
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <MetricCard
                label="Deal Value"
                value={fmt(editValue)}
                icon={<DollarSign size={16} className="text-emerald-500" />}
              />
              <MetricCard
                label="Settlement"
                value={fmtDate(deal.expectedSettlementDate)}
                sub={
                  f.overdue ? `${f.overdueDays}d overdue` : du === 0 ? "Today" : du < Infinity ? `in ${du}d` : undefined
                }
                icon={<Calendar size={16} className="text-blue-500" />}
                subColor={f.overdue ? "text-red-500" : "text-gray-400"}
              />
            </div>
            {na.label && (
              <div
                className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border ${
                  na.urgency === "urgent"
                    ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                    : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                }`}
              >
                {na.urgency === "urgent" ? (
                  <AlertTriangle size={14} className="text-red-500" />
                ) : (
                  <Target size={14} className="text-blue-500" />
                )}
                <span
                  className={`text-xs font-medium ${na.urgency === "urgent" ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"}`}
                >
                  Next action: <strong>{na.label}</strong>
                </span>
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <DateField label="Contract" value={deal.contractSignedDate} />
              <DateField label="Finance" value={deal.financeApprovedDate} />
              <DateField label="Settlement" value={deal.expectedSettlementDate} />
            </div>
          </div>

          {/* Financials */}
          <div className="bg-gray-50 dark:bg-slate-900/40 rounded-xl p-3 sm:p-4 space-y-3">
            <h3 className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <DollarSign size={14} /> Financials
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Deal Value
                </label>
                <input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Comm Total
                </label>
                <input
                  type="number"
                  value={editCommTotal}
                  onChange={(e) => setEditCommTotal(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Comm Paid
                </label>
                <input
                  type="number"
                  value={editCommPaid}
                  onChange={(e) => setEditCommPaid(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Commission Rate</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{commPct}%</span>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-200 dark:border-white/[0.06]">
              <span className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">Outstanding</span>
              <span
                className={`font-bold tabular-nums ${outstanding > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}
              >
                {fmt(outstanding)}
              </span>
            </div>
            {editCommTotal > 0 && (
              <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((editCommPaid / editCommTotal) * 100, 100)}%` }}
                />
              </div>
            )}
            <button
              onClick={handleSaveFinancials}
              disabled={savingFinancials}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition min-h-[44px]"
            >
              {savingFinancials ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {savingFinancials ? "Saving..." : "Save Financials"}
            </button>
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <History size={14} /> Activity Timeline ({timeline.length})
            </h3>
            <div className="space-y-3 max-h-[200px] sm:max-h-[300px] overflow-y-auto">
              {timeline.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No activity yet</p>}
              {timeline.map((entry) => (
                <div key={entry.id} className="flex gap-2 sm:gap-3">
                  <div
                    className={`flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-white ${entry.type === "note" ? "bg-amber-500" : entry.type === "call" ? "bg-blue-500" : "bg-gray-400"}`}
                  >
                    {entry.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 flex-wrap">
                      <span className="text-[10px] sm:text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {entry.userName}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-gray-400">
                        {entry.timestamp ? fmtTs(entry.timestamp) : ""}
                      </span>
                      {entry.meta && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          {entry.meta}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                      {entry.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Note */}
          <div>
            <h3 className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <MessageSquare size={14} /> Add Note
            </h3>
            <div className="space-y-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none min-h-[44px]"
              />
              <button
                onClick={handleAddNote}
                disabled={saving || !noteText.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition min-h-[44px]"
              >
                {saving ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                {saving ? "Saving..." : "Add Note"}
              </button>
            </div>
          </div>

          {/* Documents */}
          <DealDocumentsSection deal={deal} clientId={deal.leadId || ""} reps={reps} />
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deal Documents Section
// ─────────────────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<DealDocumentType, string> = {
  oa: "Offer & Acceptance",
  compliance: "Compliance",
  contract: "Contract",
  other: "Other",
};

const DOC_TYPE_COLORS: Record<DealDocumentType, string> = {
  oa: "bg-[#b8933a]/15 text-[#b8933a] dark:bg-[#b8933a]/20 dark:text-[#d4aa55]",
  compliance: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  contract: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  other: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

/** File types that can be previewed in an iframe */
const PREVIEWABLE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];

function canPreview(fileType: string): boolean {
  return PREVIEWABLE_TYPES.includes(fileType);
}

function DealDocumentsSection({ deal, clientId, reps }: { deal: Deal; clientId: string; reps: Rep[] }) {
  const dealId = deal.id;
  const { documents, loading, uploading, uploadDocument, deleteDocument, deletingId, setDeletingId } =
    useDealDocuments(dealId);
  const { showToast } = useToast();
  const { currentUser } = useAppStore();
  const { lead } = useLinkedLead(deal.leadId || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState<DealDocumentType>("other");
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DealDocument | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [oaEditorOpen, setOaEditorOpen] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadDocument(file, selectedType, clientId);
      if (result.success) {
        showToast("✅ Document uploaded", "success");
      } else {
        showToast(`❌ ${result.error}`, "error");
      }
    } catch {
      showToast("❌ Failed to upload document", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteClick = (docId: string) => {
    setDeleteConfirmId(docId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    const doc = documents.find((d) => d.id === deleteConfirmId);
    if (!doc) return;

    setDeletingId(deleteConfirmId);
    try {
      const result = await deleteDocument(doc);
      if (result.success) {
        showToast("🗑️ Document deleted", "success");
      } else {
        showToast(`❌ ${result.error || "Failed to delete"}`, "error");
      }
    } catch {
      showToast("❌ Failed to delete document", "error");
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null);
  };

  const fmtBytes = (bytes: number) => {
    if (bytes == null || bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fmtDateShort = (ts: number) => {
    try {
      return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return "—";
    }
  };

  // Documents are already sorted by createdAt desc in the hook (orderBy in query)
  const sortedDocs = documents;

  const deleteTarget = deleteConfirmId ? documents.find((d) => d.id === deleteConfirmId) : null;

  return (
    <div>
      <h3 className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <FileText size={14} /> Documents ({documents.length})
      </h3>

      {/* Upload bar */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => setOaEditorOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#b8933a] text-[#b8933a] hover:bg-[#b8933a]/10 transition min-h-[44px]"
          title="Create Offer & Acceptance document"
        >
          <FileText size={14} /> Create O&A
        </button>
        <div className="relative">
          <button
            onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)] disabled:opacity-50 transition min-h-[44px]"
          >
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${DOC_TYPE_COLORS[selectedType]}`}>
              {DOC_TYPE_LABELS[selectedType]}
            </span>
            <ChevronDown size={12} />
          </button>
          {typeDropdownOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setTypeDropdownOpen(false)} />
              <div className="absolute z-30 mt-1 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-lg shadow-lg min-w-[200px] overflow-hidden">
                {(Object.keys(DOC_TYPE_LABELS) as DealDocumentType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setSelectedType(t);
                      setTypeDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] flex items-center gap-2 transition min-h-[44px]"
                  >
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${DOC_TYPE_COLORS[t]}`}>
                      {DOC_TYPE_LABELS[t]}
                    </span>
                    {t === selectedType && <CheckCircle size={13} className="text-green-500 ml-auto" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !currentUser}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#b8933a] text-white hover:bg-[#d4aa55] disabled:opacity-50 transition min-h-[44px]"
        >
          {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>

      {/* Allowed file types hint */}
      <div className="flex items-center gap-1.5 mb-3 text-[10px] text-gray-400 dark:text-gray-500">
        <Shield size={11} />
        <span>PDF, PNG, JPG, DOC, DOCX — max 10 MB</span>
      </div>

      {/* Document list */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader size={18} className="animate-spin text-gray-400" />
        </div>
      )}
      {!loading && documents.length === 0 && (
        <div className="text-center py-8">
          <File size={28} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          <p className="text-xs text-gray-400 dark:text-gray-500">No documents uploaded yet</p>
          <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">
            Upload contracts, compliance docs, and more
          </p>
        </div>
      )}
      {!loading && sortedDocs.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {sortedDocs.map((doc) => {
            const isDeleting = deletingId === doc.id;
            const previewable = canPreview(doc.fileType || "");
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-white/[0.03] hover:bg-gray-100 dark:hover:bg-white/[0.05] transition group"
              >
                <File size={16} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{doc.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${DOC_TYPE_COLORS[doc.type]}`}>
                      {DOC_TYPE_LABELS[doc.type]}
                    </span>
                    <span className="text-[10px] text-gray-400">{fmtDateShort(doc.createdAt)}</span>
                    {doc.fileSize > 0 && <span className="text-[10px] text-gray-400">{fmtBytes(doc.fileSize)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition">
                  {previewable ? (
                    <button
                      onClick={() => setPreviewDoc(doc)}
                      className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                      title="Preview"
                    >
                      <Eye size={14} />
                    </button>
                  ) : (
                    <span className="p-1.5 text-gray-300 dark:text-gray-600 cursor-default" title="Download only">
                      <Eye size={14} />
                    </span>
                  )}
                  {doc.fileUrl ? (
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                      title="Download"
                    >
                      <Download size={14} />
                    </a>
                  ) : (
                    <span className="p-1.5 text-gray-300 dark:text-gray-600 cursor-default" title="No file URL">
                      <Download size={14} />
                    </span>
                  )}
                  {currentUser && (
                    <button
                      onClick={() => handleDeleteClick(doc.id)}
                      disabled={isDeleting}
                      className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 disabled:opacity-40 transition"
                      title={isDeleting ? "Deleting…" : "Delete"}
                    >
                      {isDeleting ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewDoc && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setPreviewDoc(null)} />
          <div className="fixed inset-4 sm:inset-8 z-[61] bg-white dark:bg-[var(--surface)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/[0.06]">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate mr-4">
                {previewDoc.name}
              </h3>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 transition flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe src={previewDoc.fileUrl} className="w-full h-full border-0" title="Document preview" />
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[70]" onClick={handleDeleteCancel} />
          <div className="fixed inset-0 z-[71] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Delete Document</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-white/[0.03] rounded-lg p-3 mb-4 truncate">
                {deleteTarget.name}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleDeleteCancel}
                  disabled={deletingId !== null}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50 transition min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deletingId !== null}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition flex items-center gap-1.5 min-h-[44px]"
                >
                  {deletingId !== null ? (
                    <>
                      <Loader size={14} className="animate-spin" /> Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} /> Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* O&A Document Editor Modal */}
      {oaEditorOpen && (
        <OADocumentEditor
          deal={deal}
          lead={lead}
          reps={reps}
          currentUser={currentUser}
          onClose={() => setOaEditorOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricCard / DateField
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  icon,
  subColor = "text-gray-400",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  subColor?: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-slate-900/40 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      </div>
      <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tabular-nums">{value}</div>
      {sub && <div className={`text-[10px] sm:text-xs mt-0.5 ${subColor} font-medium`}>{sub}</div>}
    </div>
  );
}

function DateField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-slate-900/40 rounded-lg p-2 sm:p-2.5">
      <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase mb-0.5">
        {label}
      </div>
      <div className="text-[10px] sm:text-xs text-gray-900 dark:text-white font-medium tabular-nums">
        {value ? fmtDate(value) : "—"}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateDealModal
// ─────────────────────────────────────────────────────────────────────────────

interface CreateForm {
  clientName: string;
  dealValue: string;
  commissionTotal: string;
  expectedSettlementDate: string;
  assignedTo: number | "";
  contractSignedDate: string;
  financeApprovedDate: string;
  leadId?: string;
}

function CreateDealModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { reps, currentUser } = useAppStore();
  const { showToast } = useToast();
  const [form, setForm] = useState<CreateForm>({
    clientName: "",
    dealValue: "",
    commissionTotal: "",
    expectedSettlementDate: "",
    assignedTo: currentUser?.id || "",
    contractSignedDate: "",
    financeApprovedDate: "",
    leadId: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const activeReps = reps.filter((r) => r.active);

  const validate = (): boolean => {
    const e: Partial<Record<keyof CreateForm, string>> = {};
    if (!form.clientName.trim()) e.clientName = "Client name is required";
    if (!form.dealValue || Number(form.dealValue) <= 0) e.dealValue = "Enter a valid deal value";
    if (!form.expectedSettlementDate) e.expectedSettlementDate = "Settlement date is required";
    if (!form.assignedTo) e.assignedTo = "Assign a rep";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const now = Date.now();
      const dealRef = await addDoc(collection(db, "deals"), {
        clientName: form.clientName.trim(),
        status: "lead",
        dealValue: Number(form.dealValue),
        commissionTotal: Number(form.commissionTotal) || 0,
        commissionPaid: 0,
        expectedSettlementDate: form.expectedSettlementDate,
        contractSignedDate: form.contractSignedDate || undefined,
        financeApprovedDate: form.financeApprovedDate || undefined,
        assignedTo: Number(form.assignedTo),
        lastUpdate: now,
        notes: [],
        createdAt: now,
        createdBy: currentUser?.name || "Unknown",
        leadId: form.leadId || undefined,
      });
      if (form.leadId) await setDoc(doc(db, "leads", form.leadId), { dealId: dealRef.id }, { merge: true });
      showToast("✅ Deal created", "success");
      onSuccess();
    } catch {
      showToast("❌ Failed to create deal", "error");
    } finally {
      setSaving(false);
    }
  };

  const update = (field: keyof CreateForm, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field])
      setErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
  };

  const ic = (err: boolean) =>
    `w-full px-3 py-2 rounded-lg border ${err ? "border-red-500" : "border-gray-300 dark:border-white/[0.08]"} bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[44px]`;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-amber-500" />
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Create New Deal</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)] text-gray-400 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-4 sm:px-6 py-3 sm:py-5 space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Client Name *</label>
              <input
                className={ic(!!errors.clientName)}
                placeholder="John & Sarah Smith"
                value={form.clientName}
                onChange={(e) => update("clientName", e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Deal Value *
                </label>
                <input
                  type="number"
                  className={ic(!!errors.dealValue)}
                  placeholder="500000"
                  value={form.dealValue}
                  onChange={(e) => update("dealValue", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Commission Total
                </label>
                <input
                  type="number"
                  className={ic(false)}
                  placeholder="5000"
                  value={form.commissionTotal}
                  onChange={(e) => update("commissionTotal", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Expected Settlement Date *
              </label>
              <input
                type="date"
                className={ic(!!errors.expectedSettlementDate)}
                value={form.expectedSettlementDate}
                onChange={(e) => update("expectedSettlementDate", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Contract Signed
                </label>
                <input
                  type="date"
                  className={ic(false)}
                  value={form.contractSignedDate}
                  onChange={(e) => update("contractSignedDate", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Finance Approved
                </label>
                <input
                  type="date"
                  className={ic(false)}
                  value={form.financeApprovedDate}
                  onChange={(e) => update("financeApprovedDate", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Assigned To *</label>
              <select
                className={ic(!!errors.assignedTo)}
                value={form.assignedTo}
                onChange={(e) => update("assignedTo", e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">— Select Rep —</option>
                {activeReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {errors.assignedTo && <p className="text-xs text-red-500 mt-1">{errors.assignedTo}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Lead ID (optional)
              </label>
              <input
                className={ic(false)}
                placeholder="e.g. 12345"
                value={form.leadId || ""}
                onChange={(e) => update("leadId", e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Link to existing lead for call history &amp; timeline</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-white/[0.06]">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition text-sm min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 disabled:opacity-50 transition text-sm min-h-[44px]"
            >
              {saving ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {saving ? "Creating..." : "Create Deal"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DealsTable (desktop) / DealCards (mobile)
// ─────────────────────────────────────────────────────────────────────────────

type SortField = "expectedSettlementDate" | "dealValue" | "commissionTotal" | "lastUpdate";
type SortDir = "asc" | "desc";

function DealsTable({
  deals,
  leadMap,
  reps,
  onOpen,
  onStatusChange,
  onUpdateField,
  sortField,
  sortDir,
  onSort,
  stuckDays = DEFAULT_STUCK_DAYS,
  atRiskDays = DEFAULT_AT_RISK_DAYS,
}: {
  deals: Deal[];
  leadMap: Map<string, Lead | null>;
  reps: Rep[];
  onOpen: (d: Deal) => void;
  onStatusChange: (id: string, s: DealStatus) => void;
  onUpdateField: (id: string, field: string, value: unknown) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  stuckDays?: number;
  atRiskDays?: number;
}) {
  const thCls =
    "px-3 py-2.5 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide";
  const sortIcon = (f: SortField) =>
    sortField === f ? sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null;

  if (deals.length === 0) {
    return (
      <div className="border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
          <TrendingUp size={48} className="mb-3 opacity-50" />
          <p className="text-sm">No deals found</p>
          <p className="text-xs mt-1">Try adjusting your filters or create a new deal</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            lead={leadMap.get(d.leadId || "") || null}
            reps={reps}
            onOpen={onOpen}
            stuckDays={stuckDays}
            atRiskDays={atRiskDays}
          />
        ))}
      </div>

      {/* Desktop: full table */}
      <div className="hidden md:block border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm group" style={{ minWidth: "1100px" }}>
            <thead className="bg-gray-50 dark:bg-slate-900/40">
              <tr>
                <th className={thCls}>Status</th>
                <th className={thCls}>Client</th>
                <th className={`${thCls} hidden lg:table-cell`}>Value</th>
                <th className={`${thCls} hidden xl:table-cell`}>Commission</th>
                <th
                  className={`${thCls} hidden md:table-cell cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none`}
                  onClick={() => onSort("expectedSettlementDate")}
                >
                  <div className="flex items-center gap-1">Settlement {sortIcon("expectedSettlementDate")}</div>
                </th>
                <th className={`${thCls} hidden xl:table-cell`}>Last Contact</th>
                <th className={`${thCls} hidden sm:table-cell`}>Next Action</th>
                <th className={`${thCls} hidden lg:table-cell`}>Assigned</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-[var(--surface)]">
              {deals.map((d) => (
                <DealRow
                  key={d.id}
                  deal={d}
                  lead={leadMap.get(d.leadId || "") || null}
                  reps={reps}
                  onOpen={onOpen}
                  onStatusChange={onStatusChange}
                  onUpdateField={onUpdateField}
                  stuckDays={stuckDays}
                  atRiskDays={atRiskDays}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompletedDealsTable (with summary stats)
// ─────────────────────────────────────────────────────────────────────────────

function CompletedDealsTable({
  deals,
  leadMap,
  reps,
  onOpen,
}: {
  deals: Deal[];
  leadMap: Map<string, Lead | null>;
  reps: Rep[];
  onOpen: (d: Deal) => void;
}) {
  const summary = useMemo(
    () => ({
      count: deals.length,
      totalValue: deals.reduce((s, d) => s + (d.dealValue || 0), 0),
      totalPaid: deals.reduce((s, d) => s + (d.commissionPaid || 0), 0),
    }),
    [deals],
  );

  if (deals.length === 0) {
    return (
      <div className="border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
          <CheckCircle size={48} className="mb-3 opacity-50" />
          <p className="text-sm">No completed deals</p>
        </div>
      </div>
    );
  }

  const thCls =
    "px-3 py-2.5 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide";

  return (
    <div className="space-y-3">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Settled
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {summary.count}
          </div>
        </div>
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Settled Value
          </div>
          <div className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">
            {fmt(summary.totalValue)}
          </div>
        </div>
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 sm:p-4 sm:col-span-1 col-span-2">
          <div className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Commission Paid
          </div>
          <div className="text-xl sm:text-2xl font-bold text-green-700 dark:text-green-300 tabular-nums">
            {fmt(summary.totalPaid)}
          </div>
        </div>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-2 md:hidden">
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} lead={leadMap.get(d.leadId || "") || null} reps={reps} onOpen={onOpen} />
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "700px" }}>
            <thead className="bg-gray-50 dark:bg-slate-900/40">
              <tr>
                <th className={thCls}>Status</th>
                <th className={thCls}>Client</th>
                <th className={thCls}>Value</th>
                <th className={thCls}>Comm Paid</th>
                <th className={thCls}>Settlement</th>
                <th className={thCls}>Assigned</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-[var(--surface)]">
              {deals.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => onOpen(d)}
                  className="border-b border-gray-100 dark:border-white/[0.06] hover:bg-gray-50 dark:hover:bg-[var(--hover)] cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <span className={badge(d.status)}>{ST[d.status].label}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-sm text-gray-900 dark:text-white">{d.clientName}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                      {fmt(d.dealValue)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm text-green-600 dark:text-green-400 tabular-nums">
                      {fmt(d.commissionPaid)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {fmtDate(d.expectedSettlementDate)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <User size={14} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">{repName(d.assignedTo, reps)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onOpen(d)}
                      className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-400 transition min-h-[44px] min-w-[44px] justify-center"
                    >
                      <Eye size={14} />
                      <span className="hidden sm:inline">Open</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────

type ViewMode = "active" | "completed";

export function DealDashboardPage() {
  const { deals, loading, error } = useDeals();
  const { reps, currentUser, leads } = useAppStore();
  const { showToast } = useToast();

  // Pull live thresholds from Firestore — no redeploy needed to change behaviour
  const { config: appConfig } = useAppSettings();
  const stuckDays = appConfig.dealSettings.stuckDaysThreshold;
  const atRiskDays = appConfig.dealSettings.atRiskDaysThreshold;

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [repFilter, setRepFilter] = useState<number | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [sortField, setSortField] = useState<SortField>("expectedSettlementDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Build lead lookup map from Zustand store
  const leadMap = useMemo(() => {
    const m = new Map<string, Lead>();
    (leads || []).forEach((l) => m.set(String(l.id), l));
    return m;
  }, [leads]);

  const selectedDealFresh = useMemo(() => {
    if (!selectedDeal) return null;
    return deals.find((d) => d.id === selectedDeal.id) || selectedDeal;
  }, [deals, selectedDeal, refreshKey]);

  // Filtering + sorting
  const filtered = useMemo(() => {
    let result = deals;
    if (viewMode === "active") result = result.filter((d) => isActive(d.status));
    else result = result.filter((d) => isComplete(d.status));

    // Chase / At Risk filter
    if (stageFilter === "chase")
      result = result.filter(
        (d) => getFlags(d, stuckDays, atRiskDays).isStuck && !getFlags(d, stuckDays, atRiskDays).isAtRisk,
      );
    else if (stageFilter === "at-risk") result = result.filter((d) => getFlags(d, stuckDays, atRiskDays).isAtRisk);
    else if (stageFilter !== "all") result = result.filter((d) => d.status === stageFilter);

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter((d) => d.clientName.toLowerCase().includes(term));
    }
    if (repFilter !== "all") result = result.filter((d) => d.assignedTo === repFilter);

    // At Risk deals appear at top when active
    result = [...result].sort((a, b) => {
      const fa = getFlags(a, stuckDays, atRiskDays),
        fb = getFlags(b, stuckDays, atRiskDays);
      if (viewMode === "active") {
        if (fa.isAtRisk && !fb.isAtRisk) return -1;
        if (!fa.isAtRisk && fb.isAtRisk) return 1;
      }
      let c = 0;
      if (sortField === "expectedSettlementDate") c = a.expectedSettlementDate.localeCompare(b.expectedSettlementDate);
      else if (sortField === "dealValue") c = (a.dealValue || 0) - (b.dealValue || 0);
      else if (sortField === "commissionTotal") c = (a.commissionTotal || 0) - (b.commissionTotal || 0);
      else if (sortField === "lastUpdate") c = (a.lastUpdate || 0) - (b.lastUpdate || 0);
      return sortDir === "asc" ? c : -c;
    });

    return result;
  }, [deals, viewMode, stageFilter, search, repFilter, sortField, sortDir, refreshKey, stuckDays, atRiskDays]);

  const activeReps = reps.filter((r) => r.active);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(f);
      setSortDir("asc");
    }
  };
  const handleStatusChange = useCallback((_id: string, _s: DealStatus) => {
    setRefreshKey((k) => k + 1);
  }, []);
  const handleUpdateField = useCallback(
    async (id: string, field: string, value: unknown) => {
      try {
        await updateDoc(doc(db, "deals", id), { [field]: value, lastUpdate: Date.now() });
        showToast("✅ Updated", "success");
        setRefreshKey((k) => k + 1);
      } catch {
        showToast("❌ Failed to update", "error");
      }
    },
    [showToast],
  );

  if (loading)
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size={32} className="animate-spin text-amber-500" />
      </div>
    );
  if (error)
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-4">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-3" />
          <p className="text-gray-700 dark:text-gray-300 font-semibold text-base">Unable to load deals</p>
          {error && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto break-words">{error}</p>
          )}
        </div>
      </div>
    );

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[var(--surface)] overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
        <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp size={18} className="text-amber-500 sm:w-5 sm:h-5" /> Deal Dashboard
        </h1>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg bg-amber-500 text-white text-xs sm:text-sm font-semibold hover:bg-amber-400 transition min-h-[44px]"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Create Deal</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-5">
          {/* Stats */}
          <StatsBar deals={deals} />
          {/* Stage Breakdown (incl. Chase + At Risk) */}
          <StageBreakdown
            deals={deals}
            selected={stageFilter}
            onSelect={setStageFilter}
            stuckDays={stuckDays}
            atRiskDays={atRiskDays}
          />

          {/* Empty State */}
          {deals.length === 0 && (
            <div className="text-center py-12">
              <Briefcase size={48} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">No deals yet</h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                Create your first deal to start tracking your pipeline.
              </p>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition"
              >
                <Plus size={16} /> Create Your First Deal
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by client name..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[44px]"
              />
            </div>
            <select
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[44px]"
            >
              <option value="all">All Reps</option>
              {activeReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border border-gray-300 dark:border-white/[0.08] overflow-hidden">
              <button
                onClick={() => {
                  setViewMode("active");
                  if (stageFilter === "chase" || stageFilter === "at-risk") setStageFilter("all");
                }}
                className={`px-3 sm:px-4 py-2 text-sm font-medium transition min-h-[44px] ${viewMode === "active" ? "bg-amber-500 text-white" : "bg-white dark:bg-[var(--surface)] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"}`}
              >
                Active
              </button>
              <button
                onClick={() => {
                  setViewMode("completed");
                  setStageFilter("all");
                }}
                className={`px-3 sm:px-4 py-2 text-sm font-medium transition min-h-[44px] ${viewMode === "completed" ? "bg-amber-500 text-white" : "bg-white dark:bg-[var(--surface)] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"}`}
              >
                Completed
              </button>
            </div>
          </div>

          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
            Showing {filtered.length} of{" "}
            {viewMode === "active"
              ? deals.filter((d) => isActive(d.status)).length
              : deals.filter((d) => isComplete(d.status)).length}{" "}
            {viewMode} deals
            {stageFilter === "chase" && ` · ${filtered.length} need attention`}
            {stageFilter === "at-risk" && ` · ${filtered.length} at risk`}
          </div>

          {/* Table / Cards */}
          {viewMode === "active" ? (
            <DealsTable
              deals={filtered}
              leadMap={leadMap}
              reps={reps}
              onOpen={setSelectedDeal}
              onStatusChange={handleStatusChange}
              onUpdateField={handleUpdateField}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              stuckDays={stuckDays}
              atRiskDays={atRiskDays}
            />
          ) : (
            <CompletedDealsTable deals={filtered} leadMap={leadMap} reps={reps} onOpen={setSelectedDeal} />
          )}
        </div>
      </div>

      {/* Drawer */}
      {selectedDealFresh && (
        <DealDrawer
          deal={selectedDealFresh}
          reps={reps}
          currentUser={currentUser}
          onClose={() => setSelectedDeal(null)}
          onUpdate={() => setRefreshKey((k) => k + 1)}
          stuckDays={stuckDays}
          atRiskDays={atRiskDays}
        />
      )}
      {/* Create Modal */}
      {createModalOpen && (
        <CreateDealModal onClose={() => setCreateModalOpen(false)} onSuccess={() => setCreateModalOpen(false)} />
      )}
    </div>
  );
}

export default DealDashboardPage;
