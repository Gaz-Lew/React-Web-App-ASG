import React, { useState, useMemo, useCallback } from "react";
import {
  useLeads,
  useSaveLead,
  useAppointments,
  useSaveAppointment,
  useLeadFiles,
  useServiceTypes,
} from "../hooks/useFirebase";
import { useAppStore } from "../stores/appStore";
import { CallLogger } from "../components/CallLogger";
import { AppointmentModal } from "../components/AppointmentModal";
import { FinancialReportsTab } from "../components/client/FinancialReportsTab";
import { useToast } from "../context/ToastContext";
import { Lead, LeadFile, Rep, ServiceType } from "../types";
import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  Phone,
  Search,
  X,
  CalendarPlus,
  FileText,
  History,
  Info,
  Download,
  Calendar,
  MapPin,
  Mail,
  ExternalLink,
  Clock,
  User,
  BarChart3,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeDateKey(dateStr: string | undefined | null): string {
  if (!dateStr) return "No Date";
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return "No Date";
}

function formatGroupDate(dateKey: string): string {
  if (dateKey === "No Date") return "No Date";
  const d = new Date(dateKey + "T00:00:00");
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function buildAddress(lead: Lead): string {
  return [lead.houseNum, lead.street, lead.suburb, lead.postcode].filter(Boolean).join(" ") || "—";
}

function formatDate(d?: string): string {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function formatDateTime(ts?: string | number): string {
  if (!ts) return "—";
  try {
    const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
    return d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

interface DealStageInfo {
  label: string;
  bgClass: string;
  textClass: string;
}

function getDealStage(lead: Lead): DealStageInfo {
  if (lead.settlementDate)
    return {
      label: "Settlement",
      bgClass: "bg-amber-100 dark:bg-amber-900/30",
      textClass: "text-amber-700 dark:text-amber-400",
    };
  if (lead.frAppt?.result)
    return {
      label: "FR Done",
      bgClass: "bg-purple-100 dark:bg-purple-900/30",
      textClass: "text-purple-700 dark:text-purple-400",
    };
  if (lead.frAppt?.date)
    return {
      label: "FR Booked",
      bgClass: "bg-gray-100 dark:bg-gray-800/30",
      textClass: "text-gray-700 dark:text-gray-400",
    };
  if (lead.fcAppt?.result)
    return {
      label: "FC Done",
      bgClass: "bg-gray-200 dark:bg-gray-700/30",
      textClass: "text-gray-800 dark:text-gray-300",
    };
  if (lead.fcAppt?.date)
    return {
      label: "FC Booked",
      bgClass: "bg-green-100 dark:bg-green-900/30",
      textClass: "text-green-700 dark:text-green-400",
    };
  // Fallback for leads with appointments but no FC/FR data
  return {
    label: "Active",
    bgClass: "bg-blue-100 dark:bg-blue-900/30",
    textClass: "text-blue-700 dark:text-blue-400",
  };
}

const CALL_RESULT_COLORS: Record<string, string> = {
  connected: "text-green-600 bg-green-50 dark:bg-green-900/30",
  no_answer: "text-gray-500 bg-gray-50 dark:bg-[var(--surface)]",
  not_interested: "text-red-500 bg-red-50 dark:bg-red-900/30",
  wrong_number: "text-gray-400 bg-gray-50 dark:bg-[var(--surface)]",
  callback: "text-orange-500 bg-orange-50 dark:bg-orange-900/30",
  booked: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30",
};

const STAGE_FILTERS = ["All", "FC Booked", "FC Done", "FR Booked", "FR Done", "Settlement"] as const;
type StageFilter = (typeof STAGE_FILTERS)[number];

// ── Details Tab ──────────────────────────────────────────────────────────────

function DetailsTab({ lead, reps }: { lead: Lead; reps: Rep[] }) {
  const repName = (id?: number) => reps.find((r) => r.id === id)?.name ?? "—";
  const address = buildAddress(lead);
  const mapsUrl = address !== "—" ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null;

  const row = (label: string, value: string | undefined | null) =>
    value ? (
      <div key={label} className="flex gap-2 py-2 border-b border-[var(--border)] last:border-0">
        <span className="text-xs text-[var(--text-muted)] w-28 flex-shrink-0">{label}</span>
        <span className="text-xs text-[var(--text)] flex-1">{value}</span>
      </div>
    ) : null;

  return (
    <div className="p-4 space-y-4">
      {/* Contact info */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 space-y-1">
        <p className="text-label mb-2">Contact</p>
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 py-1"
          >
            <Phone size={13} /> {lead.phone}
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 py-1"
          >
            <Mail size={13} /> {lead.email}
          </a>
        )}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 py-1"
          >
            <MapPin size={13} /> {address} <ExternalLink size={10} className="opacity-50" />
          </a>
        )}
      </div>

      {/* Lead details */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
        <p className="text-label mb-2">Lead Info</p>
        {row("Ownership", lead.ownership)}
        {row("Superannuation", lead.superannuation)}
        {row("Booking Date", formatDate(lead.bookingDate))}
        {row("Booking Time", lead.bookingTime)}
        {row("DQ Rep", repName(lead.dqRep))}
        {row("Lead Date", formatDate(lead.leadDate))}
      </div>

      {/* Deal pipeline */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 space-y-3">
        <p className="text-label">Deal Pipeline</p>

        {/* FC */}
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/20 border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1.5">Finance Consult (FC)</p>
          {row("FC Rep", repName(lead.fcAppt?.repId ?? lead.fcRep))}
          {row("FC Date", formatDate(lead.fcAppt?.date))}
          {row("FC Result", lead.fcAppt?.result)}
          {row("FC Notes", lead.fcAppt?.notes)}
          {!lead.fcAppt?.date && !lead.fcRep && <p className="text-xs text-gray-400 italic">Not scheduled yet</p>}
        </div>

        {/* FR */}
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/20 border border-gray-100 dark:border-gray-700 p-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-400 mb-1.5">Finance Review (FR)</p>
          {row("FR Rep", repName(lead.frAppt?.repId ?? lead.frRep))}
          {row("FR Date", formatDate(lead.frAppt?.date))}
          {row("FR Result", lead.frAppt?.result)}
          {row("FR Notes", lead.frAppt?.notes)}
          {!lead.frAppt?.date && !lead.frRep && <p className="text-xs text-gray-400 italic">Not scheduled yet</p>}
        </div>

        {/* Settlement */}
        {lead.settlementDate && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">Settlement</p>
            {row("Settlement Date", formatDate(lead.settlementDate))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Documents Tab ────────────────────────────────────────────────────────────

function DocumentsTab({ lead }: { lead: Lead }) {
  const { files, loading } = useLeadFiles(String(lead.id));

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Loading documents…</div>;

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-400">
        <FileText size={32} className="mb-2 opacity-30" />
        <p className="text-sm">No documents yet</p>
        <p className="text-xs mt-1">Files attached via the Lead sidebar appear here</p>
      </div>
    );
  }

  const grouped = files.reduce<Record<string, LeadFile[]>>((acc, f) => {
    const cat = f.type === "photo" ? "Photos" : f.type === "document" ? "Documents" : "Files";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-4">
      {Object.entries(grouped).map(([cat, catFiles]) => (
        <div key={cat}>
          <p className="text-label mb-2">
            {cat} ({catFiles.length})
          </p>
          <div className="space-y-2">
            {catFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:border-amber-300 dark:hover:border-amber-600 transition-colors"
              >
                <FileText size={16} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(file.fileSize)} · {file.uploadedBy}
                  </p>
                </div>
                <a
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors flex-shrink-0"
                  title="Download"
                >
                  <Download size={14} />
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ lead, reps, serviceTypes }: { lead: Lead; reps: Rep[]; serviceTypes: ServiceType[] }) {
  const { appointments } = useAppointments({ from: "2020-01-01", to: "2035-12-31" });
  const repName = (id?: number) => reps.find((r) => r.id === id)?.name ?? "—";
  const svcName = (id?: string) => serviceTypes.find((s) => s.id === id)?.name ?? "—";

  // Calendar appointments for this client
  const clientAppts = useMemo(
    () =>
      appointments
        .filter((a) => a.linkedLeadId === lead.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)),
    [appointments, lead.id],
  );

  // Call history — newest first
  const callHistory = useMemo(() => [...(lead.callHistory ?? [])].reverse(), [lead.callHistory]);

  const STATUS_LABELS: Record<string, string> = {
    "pencilled-in": "Pencilled In",
    confirmed: "Confirmed",
    completed: "Completed",
    "no-show": "No Show",
    cancelled: "Cancelled",
  };

  return (
    <div className="p-4 space-y-4">
      {/* Calendar Appointments */}
      <div>
        <p className="text-label mb-2 flex items-center gap-1.5">
          <Calendar size={12} /> Calendar Appointments ({clientAppts.length})
        </p>
        {clientAppts.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-1">No calendar appointments yet</p>
        ) : (
          <div className="space-y-2">
            {clientAppts.map((appt) => {
              const svc = serviceTypes.find((s) => s.id === appt.serviceTypeId);
              return (
                <div
                  key={appt.id}
                  className="p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)]"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      {svc && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: svc.color }}
                        />
                      )}
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {svcName(appt.serviceTypeId)}
                      </span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                        appt.status === "completed"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : appt.status === "no-show"
                            ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                            : appt.status === "cancelled"
                              ? "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400"
                              : appt.status === "confirmed"
                                ? "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}
                    >
                      {STATUS_LABELS[appt.status] ?? appt.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> {formatDate(appt.date)} {appt.startTime}
                      {appt.endTime ? `–${appt.endTime}` : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <User size={10} /> {repName(appt.repId)}
                    </span>
                  </div>
                  {appt.notes && (
                    <p className="text-xs text-[var(--text-muted)] mt-1.5 line-clamp-2">{appt.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Call History */}
      <div>
        <p className="text-label mb-2 flex items-center gap-1.5">
          <Phone size={12} /> Call History ({callHistory.length})
        </p>
        {callHistory.length === 0 ? (
          <p className="text-xs text-gray-400 italic px-1">No calls logged yet</p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-3.5 top-4 bottom-4 w-px bg-gray-200 dark:bg-slate-700" />
            <div className="space-y-2">
              {callHistory.map((call, idx) => {
                const colorClass =
                  CALL_RESULT_COLORS[call.result] ?? "text-gray-500 bg-gray-50 dark:bg-[var(--surface)]";
                const [bgClass] = colorClass.split(" text-");
                return (
                  <div key={idx} className="relative pl-8">
                    {/* Dot */}
                    <div
                      className={`absolute left-2 top-3 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${bgClass}`}
                    />
                    <div className="p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${colorClass}`}>
                          {call.result?.replace(/_/g, " ") ?? "unknown"}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {call.rep} · {call.date ? formatDateTime(call.date) : ""}
                        </span>
                      </div>
                      {call.notes && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">{call.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Client Detail Panel ──────────────────────────────────────────────────────

type PanelTab = "details" | "documents" | "history" | "financial-reports";

interface ClientDetailPanelProps {
  lead: Lead;
  reps: Rep[];
  serviceTypes: ServiceType[];
  onClose: () => void;
  onBookAppointment: (lead: Lead) => void;
  onCall: (lead: Lead) => void;
}

function ClientDetailPanel({ lead, reps, serviceTypes, onClose, onBookAppointment, onCall }: ClientDetailPanelProps) {
  const [tab, setTab] = useState<PanelTab>("details");
  const { files } = useLeadFiles(String(lead.id));
  const { appointments } = useAppointments({ from: "2020-01-01", to: "2035-12-31" });
  const clientAppts = useMemo(() => appointments.filter((a) => a.linkedLeadId === lead.id), [appointments, lead.id]);
  const callCount = lead.callHistory?.length ?? 0;
  const stage = getDealStage(lead);

  const TABS: { key: PanelTab; icon: typeof Info; label: string; count?: number }[] = [
    { key: "details", icon: Info, label: "Details" },
    { key: "documents", icon: FileText, label: "Documents", count: files.length },
    { key: "history", icon: History, label: "History", count: clientAppts.length + callCount },
    { key: "financial-reports", icon: BarChart3 as typeof Info, label: "Reports" },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--surface)]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{lead.name}</h2>
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="text-sm text-amber-500 hover:text-amber-600 dark:text-amber-400">
                {lead.phone}
              </a>
            )}
            <div className="mt-1">
              <span
                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${stage.bgClass} ${stage.textClass}`}
              >
                {stage.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded-lg text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onBookAppointment(lead)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors"
          >
            <CalendarPlus size={13} /> Book Appointment
          </button>
          <button
            onClick={() => onCall(lead)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-[var(--surface)] text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-200 dark:hover:bg-[var(--hover)] transition-colors"
          >
            <Phone size={13} /> Log Call
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 mt-3 bg-gray-100 dark:bg-[var(--surface)] rounded-lg p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md font-medium transition-colors ${
                tab === t.key
                  ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <t.icon size={11} /> {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={`px-1 py-0.5 rounded text-[9px] font-bold ${tab === t.key ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "bg-gray-200 dark:bg-slate-700 text-gray-500"}`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "details" && <DetailsTab lead={lead} reps={reps} />}
        {tab === "documents" && <DocumentsTab lead={lead} />}
        {tab === "history" && <HistoryTab lead={lead} reps={reps} serviceTypes={serviceTypes} />}
        {tab === "financial-reports" && <FinancialReportsTab clientId={String(lead.id)} />}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface ClientHubPageProps {
  initialFilter?: string | null;
  onFilterCleared?: () => void;
  /** Opens the full-screen ClientProfilePage overlay for this lead/client ID */
  onOpenProfile?: (clientId: number) => void;
}

export function ClientHubPage({ initialFilter, onFilterCleared, onOpenProfile }: ClientHubPageProps) {
  const { leads, loading } = useLeads();
  const { reps, currentUser } = useAppStore();
  const { save: saveLead } = useSaveLead();
  const { showToast } = useToast();
  const { serviceTypes } = useServiceTypes();
  const { save: saveAppt } = useSaveAppointment();
  const { appointments } = useAppointments({ from: "2020-01-01", to: "2035-12-31" });

  // Active reps only — former/inactive staff excluded from booking dropdowns
  const activeReps = useMemo(() => reps.filter((r) => r.active), [reps]);

  // Apply filter from Dashboard navigation
  const filterModifier = useMemo(() => {
    if (!initialFilter) return null;
    if (initialFilter === "fc-completed-no-fr") {
      return (l: Lead) => l.fcAppt?.result === "Completed" && !l.frAppt?.date;
    }
    return null;
  }, [initialFilter]);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [showCallLogger, setShowCallLogger] = useState(false);
  const [bookingLead, setBookingLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [repFilter, setRepFilter] = useState<number | "all">("all");
  const [stageFilter, setStageFilter] = useState<StageFilter>("All");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Leads with at least one appointment = clients
  const clients = useMemo(() => {
    const leadIdsWithAppointments = new Set(appointments.map((a) => a.linkedLeadId).filter(Boolean));
    let result = leads.filter((l) => leadIdsWithAppointments.has(l.id));
    if (filterModifier) {
      result = result.filter(filterModifier);
    }
    return result;
  }, [leads, appointments, filterModifier]);

  // Stat counts
  const stats = useMemo(() => {
    const counts = {
      total: clients.length,
      fcBooked: 0,
      fcDone: 0,
      frBooked: 0,
      frDone: 0,
      settlement: 0,
      dnq: 0,
    };
    clients.forEach((l) => {
      const s = getDealStage(l).label;
      if (s === "FC Booked") counts.fcBooked++;
      else if (s === "FC Done") counts.fcDone++;
      else if (s === "FR Booked") counts.frBooked++;
      else if (s === "FR Done") counts.frDone++;
      else if (s === "Settlement") counts.settlement++;
      else if (s === "DNQ") counts.dnq++;
    });
    return counts;
  }, [clients]);

  // Filtered + grouped
  const groupedClients = useMemo(() => {
    let filtered = clients;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          (l.name ?? "").toLowerCase().includes(q) ||
          (l.phone ?? "").includes(q) ||
          (l.suburb ?? "").toLowerCase().includes(q),
      );
    }
    if (repFilter !== "all") {
      filtered = filtered.filter(
        (l) => l.dqRep === repFilter || l.fcAppt?.repId === repFilter || l.frAppt?.repId === repFilter,
      );
    }
    if (stageFilter !== "All") {
      filtered = filtered.filter((l) => getDealStage(l).label === stageFilter);
    }

    const groupMap = new Map<string, Lead[]>();
    filtered.forEach((l) => {
      const key = normalizeDateKey(l.leadDate);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(l);
    });

    return Array.from(groupMap.entries())
      .sort(([a], [b]) => {
        if (a === "No Date") return 1;
        if (b === "No Date") return -1;
        return b.localeCompare(a);
      })
      .map(([dateKey, groupLeads]) => ({ dateKey, label: formatGroupDate(dateKey), leads: groupLeads }));
  }, [clients, search, repFilter, stageFilter]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectLead = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setShowCallLogger(false);
    setShowPanel(true);
  }, []);

  const handleBookAppointment = useCallback((lead: Lead) => {
    setBookingLead(lead);
    setShowPanel(false);
  }, []);

  const handleAddCall = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setShowPanel(false);
    setShowCallLogger(true);
  }, []);

  const handleSaveLead = useCallback(
    async (lead: Lead) => {
      const ok = await saveLead(lead);
      if (ok) {
        setSelectedLead(lead);
        showToast("✅ Client saved", "success");
      } else {
        showToast("❌ Failed to save", "error");
      }
    },
    [saveLead, showToast],
  );

  const repName = (id?: number) => reps.find((r) => r.id === id)?.name ?? "—";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50 dark:bg-[var(--bg)]">
      {/* Header */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <Briefcase size={20} className="text-amber-500" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Client Hub</h1>
          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
            {stats.total} clients
          </span>
        </div>

        {/* Filter indicator banner */}
        {initialFilter && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg text-xs text-orange-700 dark:text-orange-300 mb-4">
            <span className="font-semibold">📋 Filter: FC completed, needs FR booking</span>
            <button
              onClick={onFilterCleared}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 transition"
            >
              <span>Clear filter</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Stats bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { label: "FC Booked", count: stats.fcBooked },
            { label: "FC Done", count: stats.fcDone },
            { label: "FR Booked", count: stats.frBooked },
            { label: "FR Done", count: stats.frDone },
            { label: "Settlement", count: stats.settlement },
            { label: "DNQ", count: stats.dnq },
          ]
            .filter((s) => s.count > 0)
            .map((s) => (
              <button
                key={s.label}
                onClick={() =>
                  setStageFilter(stageFilter === (s.label as StageFilter) ? "All" : (s.label as StageFilter))
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                  stageFilter === s.label
                    ? "bg-amber-500 border-amber-500 text-white"
                    : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:border-amber-300"
                }`}
              >
                <span className="font-semibold">{s.count}</span>
                <span>{s.label}</span>
              </button>
            ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 w-48 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          {/* Active reps only in filter */}
          <select
            value={repFilter === "all" ? "all" : String(repFilter)}
            onChange={(e) => setRepFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">All Reps</option>
            {activeReps.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name}
              </option>
            ))}
          </select>
          {/* Stage filter chips */}
          <div className="flex flex-wrap gap-1">
            {STAGE_FILTERS.map((sf) => (
              <button
                key={sf}
                onClick={() => setStageFilter(sf)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                  stageFilter === sf
                    ? "bg-amber-500 text-white"
                    : "bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                }`}
              >
                {sf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-auto min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">Loading clients…</div>
          ) : groupedClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Briefcase size={40} className="mb-3 opacity-30" />
              <p className="text-sm">No clients found</p>
              <p className="text-xs mt-1">Leads with "Booked" status appear here</p>
            </div>
          ) : (
            <div>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-labelr">
                        Client
                      </th>
                      <th className="text-left px-3 py-2.5 text-labelr hidden md:table-cell">
                        Address
                      </th>
                      <th className="text-left px-3 py-2.5 text-labelr">
                        FC Rep
                      </th>
                      <th className="text-left px-3 py-2.5 text-labelr hidden lg:table-cell">
                        FC Date
                      </th>
                      <th className="text-left px-3 py-2.5 text-labelr">
                        FR Rep
                      </th>
                      <th className="text-left px-3 py-2.5 text-labelr hidden lg:table-cell">
                        FR Date
                      </th>
                      <th className="text-left px-3 py-2.5 text-labelr">
                        Stage
                      </th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedClients.map(({ dateKey, label, leads: groupLeads }) => (
                      <React.Fragment key={dateKey}>
                        {/* Group header */}
                        <tr className="bg-gray-50 dark:bg-[var(--surface)]/50">
                          <td colSpan={8} className="px-4 py-2">
                            <button
                              onClick={() => toggleGroup(dateKey)}
                              className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                              {collapsedGroups.has(dateKey) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                              {label}
                              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                                {groupLeads.length}
                              </span>
                            </button>
                          </td>
                        </tr>
                        {/* Lead rows */}
                        {!collapsedGroups.has(dateKey) &&
                          groupLeads.map((lead) => {
                            const stage = getDealStage(lead);
                            const fcRepId = lead.fcAppt?.repId ?? lead.fcRep;
                            const frRepId = lead.frAppt?.repId ?? lead.frRep;
                            const isSelected = selectedLead?.id === lead.id && showPanel;
                            return (
                              <tr
                                key={lead.id}
                                className={`border-b border-[var(--border)] hover:bg-amber-50/50 dark:hover:bg-amber-900/10 cursor-pointer transition-colors group ${isSelected ? "bg-amber-50 dark:bg-amber-900/20" : "bg-white dark:bg-[var(--surface)]"}`}
                                onClick={() => onOpenProfile ? onOpenProfile(lead.id) : handleSelectLead(lead)}
                              >
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900 dark:text-white">{lead.name || "—"}</div>
                                  {lead.phone && (
                                    <a
                                      href={`tel:${lead.phone}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 mt-0.5 block"
                                    >
                                      {lead.phone}
                                    </a>
                                  )}
                                </td>
                                <td className="px-3 py-3 hidden md:table-cell">
                                  <span
                                    className="text-xs text-[var(--text-muted)] line-clamp-1"
                                    title={buildAddress(lead)}
                                  >
                                    {buildAddress(lead)}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <span className="text-xs text-gray-700 dark:text-gray-300">{repName(fcRepId)}</span>
                                </td>
                                <td className="px-3 py-3 hidden lg:table-cell">
                                  <span className="text-xs text-[var(--text-muted)]">
                                    {formatDate(lead.fcAppt?.date)}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <span className="text-xs text-gray-700 dark:text-gray-300">{repName(frRepId)}</span>
                                </td>
                                <td className="px-3 py-3 hidden lg:table-cell">
                                  <span className="text-xs text-[var(--text-muted)]">
                                    {formatDate(lead.frAppt?.date)}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <span
                                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${stage.bgClass} ${stage.textClass}`}
                                  >
                                    {stage.label}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <div
                                    className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={() => handleBookAppointment(lead)}
                                      className="flex items-center gap-1 px-2 py-1.5 text-xs bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors whitespace-nowrap min-h-[36px]"
                                      title="Book appointment"
                                    >
                                      <CalendarPlus size={11} />
                                      <span className="hidden xl:inline">Book</span>
                                    </button>
                                    <button
                                      onClick={() => handleAddCall(lead)}
                                      className="p-2 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                                      title="Log call"
                                    >
                                      <Phone size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-gray-100 dark:divide-slate-800">
                {groupedClients.map(({ dateKey, label, leads: groupLeads }) => (
                  <div key={dateKey}>
                    <button
                      onClick={() => toggleGroup(dateKey)}
                      className="w-full flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-[var(--surface)]/50 text-xs font-semibold text-gray-600 dark:text-gray-400"
                    >
                      {collapsedGroups.has(dateKey) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      {label} · {groupLeads.length}
                    </button>
                    {!collapsedGroups.has(dateKey) &&
                      groupLeads.map((lead) => {
                        const stage = getDealStage(lead);
                        const fcRepId = lead.fcAppt?.repId ?? lead.fcRep;
                        const frRepId = lead.frAppt?.repId ?? lead.frRep;
                        return (
                          <div
                            key={lead.id}
                            onClick={() => onOpenProfile ? onOpenProfile(lead.id) : handleSelectLead(lead)}
                            className="px-4 py-3 bg-white dark:bg-[var(--surface)] hover:bg-amber-50/50 dark:hover:bg-amber-900/10 cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <span className="font-medium text-gray-900 dark:text-white">{lead.name || "—"}</span>
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${stage.bgClass} ${stage.textClass}`}
                              >
                                {stage.label}
                              </span>
                            </div>
                            {lead.phone && (
                              <a
                                href={`tel:${lead.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="block text-sm text-amber-600 dark:text-amber-400 mb-1"
                              >
                                {lead.phone}
                              </a>
                            )}
                            <p className="text-xs text-[var(--text-muted)] mb-1">{buildAddress(lead)}</p>
                            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mb-2">
                              <span>FC: {repName(fcRepId)}</span>
                              <span>FR: {repName(frRepId)}</span>
                            </div>
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleBookAppointment(lead)}
                                className="flex items-center gap-1 px-3 py-2 text-xs bg-amber-500 text-white rounded-lg font-medium min-h-[36px]"
                              >
                                <CalendarPlus size={11} /> Book
                              </button>
                              <button
                                onClick={() => handleAddCall(lead)}
                                className="flex items-center gap-1 px-3 py-2 text-xs bg-gray-100 dark:bg-slate-700 rounded-lg text-gray-600 dark:text-gray-300 min-h-[36px]"
                              >
                                <Phone size={11} /> Call
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Desktop split-pane: Client Detail Panel (only when full-screen overlay unavailable) */}
        {!onOpenProfile && showPanel && selectedLead && (
          <div className="hidden lg:flex w-[420px] flex-shrink-0 border-l border-gray-200 dark:border-white/[0.06] overflow-hidden flex-col">
            <ClientDetailPanel
              lead={selectedLead}
              reps={reps}
              serviceTypes={serviceTypes}
              onClose={() => {
                setShowPanel(false);
                setSelectedLead(null);
              }}
              onBookAppointment={handleBookAppointment}
              onCall={handleAddCall}
            />
          </div>
        )}
      </div>

      {/* Mobile overlay: Client Detail Panel (only when full-screen overlay unavailable) */}
      {!onOpenProfile && showPanel && selectedLead && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowPanel(false);
              setSelectedLead(null);
            }}
          />
          <div className="relative w-full bg-white dark:bg-[var(--surface)] rounded-t-2xl max-h-[90vh] flex flex-col z-10">
            <ClientDetailPanel
              lead={selectedLead}
              reps={reps}
              serviceTypes={serviceTypes}
              onClose={() => {
                setShowPanel(false);
                setSelectedLead(null);
              }}
              onBookAppointment={handleBookAppointment}
              onCall={handleAddCall}
            />
          </div>
        </div>
      )}

      {/* AppointmentModal — Book appointment for a client */}
      {bookingLead && currentUser && (
        <AppointmentModal
          appointment={null}
          prefilled={{
            date: "",
            time: "09:00",
            clientName: bookingLead.name,
            clientPhone: bookingLead.phone,
            linkedLeadId: bookingLead.id,
          }}
          serviceTypes={serviceTypes}
          reps={activeReps}
          leads={leads}
          currentUser={currentUser}
          onSave={async (appt) => {
            await saveAppt(appt);
            setBookingLead(null);
            showToast("✅ Appointment booked", "success");
          }}
          onDelete={async () => {
            setBookingLead(null);
          }}
          onClose={() => setBookingLead(null)}
        />
      )}

      {/* Call Logger */}
      {selectedLead && (
        <CallLogger
          isOpen={showCallLogger}
          lead={selectedLead}
          onClose={() => setShowCallLogger(false)}
          onSave={async (updatedLead) => {
            await handleSaveLead(updatedLead);
            setShowCallLogger(false);
          }}
        />
      )}
    </div>
  );
}
