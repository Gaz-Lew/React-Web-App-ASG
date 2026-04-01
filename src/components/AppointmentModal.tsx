import React, { useState, useEffect, useRef, useMemo } from "react";
import { X, Trash2, ChevronRight } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { Appointment, AppointmentStatus, ServiceType, Lead, Rep } from "../types";

const todayStr = () => new Date().toISOString().split("T")[0];

const GRID_END_HOUR = 22;

interface AppointmentModalProps {
  appointment: Appointment | null;
  prefilled: {
    date: string;
    time: string;
    repId?: number;
    clientName?: string;
    clientPhone?: string;
    linkedLeadId?: number;
  } | null;
  serviceTypes: ServiceType[];
  reps: Rep[];
  leads: Lead[];
  currentUser: Rep;
  onSave: (appt: Appointment) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: AppointmentStatus; label: string; isOutcome?: boolean }[] = [
  // Standard progress statuses
  { value: "pencilled-in", label: "Pencilled In" },
  { value: "confirmed", label: "Confirmed" },
  { value: "arrived", label: "Arrived" },
  { value: "started", label: "Started" },
  { value: "completed", label: "Completed" },
  { value: "no-show", label: "No Show" },
  { value: "cancelled", label: "Cancelled" },
  // ASG-specific appointment outcomes
  { value: "rebook-fc", label: "ReBook - First Consult (FC)", isOutcome: true },
  { value: "rebook-fr", label: "ReBook - Finance Run (FR)", isOutcome: true },
  { value: "fc-complete-fr-booked", label: "FC Complete - FR Booked", isOutcome: true },
  { value: "stopped-at-door", label: "Stopped At Door (SAD)", isOutcome: true },
  { value: "presented-no-sale", label: "Presented No Sale (PNS)", isOutcome: true },
  { value: "did-not-qualify", label: "Did Not Qualify (DNQ)", isOutcome: true },
];

export function AppointmentModal({
  appointment,
  prefilled,
  serviceTypes,
  reps,
  leads,
  currentUser,
  onSave,
  onDelete,
  onClose,
}: AppointmentModalProps) {
  const { showToast } = useToast();
  const isEdit = !!appointment;

  const [clientName, setClientName] = useState(appointment?.clientName ?? prefilled?.clientName ?? "");
  const [clientPhone, setClientPhone] = useState(appointment?.clientPhone ?? prefilled?.clientPhone ?? "");
  const [serviceTypeId, setServiceTypeId] = useState(appointment?.serviceTypeId ?? "");
  const [repId, setRepId] = useState<number | "">(appointment?.repId ?? prefilled?.repId ?? "");
  const [date, setDate] = useState(appointment?.date ?? prefilled?.date ?? todayStr());
  const [startTime, setStartTime] = useState(appointment?.startTime ?? prefilled?.time ?? "09:00");
  const [endTime, setEndTime] = useState(appointment?.endTime ?? "");
  const [status, setStatus] = useState<AppointmentStatus>(appointment?.status ?? "pencilled-in");
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [linkedLeadId, setLinkedLeadId] = useState<number | undefined>(
    appointment?.linkedLeadId ?? prefilled?.linkedLeadId,
  );
  const [leadSearch, setLeadSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-compute end time when service type or start time changes
  useEffect(() => {
    if (!serviceTypeId || !startTime) return;
    const st = serviceTypes.find((s) => s.id === serviceTypeId);
    if (!st) return;
    const [h, m] = startTime.split(":").map(Number);
    const endMins = h * 60 + m + st.defaultDuration;
    if (endMins > GRID_END_HOUR * 60) return;
    const endH = String(Math.floor(endMins / 60)).padStart(2, "0");
    const endM = String(endMins % 60).padStart(2, "0");
    setEndTime(`${endH}:${endM}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTypeId, startTime]);

  // Filter reps to only those available for bookings
  const bookableReps = useMemo(() => reps.filter((r) => r.active && r.availableForBookings !== false), [reps]);

  // Filter service types by selected rep's allowed types
  const serviceTypesForRep = useMemo(() => {
    if (!repId) return serviceTypes;
    const rep = reps.find((r) => r.id === Number(repId));
    if (!rep?.allowedServiceTypes?.length) return serviceTypes;
    return serviceTypes.filter((st) => rep.allowedServiceTypes!.includes(st.id));
  }, [serviceTypes, reps, repId]);

  // Group service types by category — FC → FR → PS → SMSF → Coffee → General
  const PREFERRED_CATEGORY_ORDER = [
    "First Consult",
    "Finance Run",
    "Property Sale",
    "SMSF",
    "Coffee Runs",
    "General",
    "Finance",
  ];
  const categories = useMemo(() => {
    const cats = Array.from(new Set(serviceTypesForRep.map((s) => s.category)));
    return cats.sort((a, b) => {
      const ai = PREFERRED_CATEGORY_ORDER.indexOf(a);
      const bi = PREFERRED_CATEGORY_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTypesForRep]);
  const byCategory = (cat: string) => serviceTypesForRep.filter((s) => s.category === cat);

  // Smart suggestions — shown when client name field is focused and blank
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const sortBy = (arr: typeof leads, key: (l: (typeof leads)[0]) => string) =>
      [...arr].sort((a, b) => key(b).localeCompare(key(a)));

    const recentBooked = sortBy(
      leads.filter((l) => l.status === "Booked"),
      (l) => l.bookingDate ?? l.leadDate ?? "",
    ).slice(0, 6);

    const recentFC = sortBy(
      leads.filter((l) => !!l.fcAppt?.date),
      (l) => l.fcAppt?.date ?? "",
    ).slice(0, 5);

    const recentFR = sortBy(
      leads.filter((l) => !!l.frAppt?.date),
      (l) => l.frAppt?.date ?? "",
    ).slice(0, 5);

    return { recentBooked, recentFC, recentFR };
  }, [leads]);

  const pickSuggestion = (l: (typeof leads)[0]) => {
    setClientName(l.name ?? "");
    setClientPhone(l.phone ?? "");
    setLinkedLeadId(l.id);
    setShowSuggestions(false);
  };

  // Lead search results
  const leadResults =
    leadSearch.length > 1
      ? leads
          .filter((l) => {
            const n = (l.name ?? "").toLowerCase();
            const p = l.phone ?? "";
            return n.includes(leadSearch.toLowerCase()) || p.includes(leadSearch);
          })
          .slice(0, 8)
      : [];

  const linkedLead = linkedLeadId ? leads.find((l) => l.id === linkedLeadId) : null;

  const handleSave = async () => {
    if (!clientName.trim()) {
      showToast("Client name is required", "error");
      return;
    }
    if (!serviceTypeId) {
      showToast("Service type is required", "error");
      return;
    }
    if (!repId) {
      showToast("Rep is required", "error");
      return;
    }
    if (!date) {
      showToast("Date is required", "error");
      return;
    }
    if (!startTime) {
      showToast("Start time is required", "error");
      return;
    }

    setSaving(true);
    const id = appointment?.id ?? `appt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const st = serviceTypes.find((s) => s.id === serviceTypeId);
    let durationMins: number | undefined = st?.defaultDuration;
    if (endTime && startTime) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const calc = eh * 60 + em - (sh * 60 + sm);
      if (calc > 0) durationMins = calc;
    }

    await onSave({
      id,
      title: clientName.trim(),
      serviceTypeId,
      repId: Number(repId),
      date,
      startTime,
      endTime: endTime || undefined,
      durationMins,
      status,
      notes: notes.trim() || undefined,
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim() || undefined,
      linkedLeadId: linkedLeadId ?? undefined,
      createdBy: currentUser.name,
      createdAt: appointment?.createdAt ?? Date.now(),
    });
    setSaving(false);
  };

  const inputClass =
    "w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500";
  const labelClass = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-[var(--surface)] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            {isEdit ? "Edit Appointment" : "New Appointment"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[var(--hover)]">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Client Name + Smart Suggestions */}
          <div className="relative">
            <label className={labelClass}>
              Client Name <span className="text-red-500">*</span>
            </label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              onFocus={() => {
                if (!clientName) setShowSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className={inputClass}
              placeholder="John & Jane Smith"
              autoComplete="off"
            />
            {showSuggestions && (
              <div
                ref={suggestRef}
                className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-xl shadow-2xl max-h-72 overflow-y-auto"
              >
                {/* Recent Booked */}
                {suggestions.recentBooked.length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-amber-600 uppercase tracking-wider bg-amber-50/60 dark:bg-amber-900/10 sticky top-0 z-10">
                      📅 Recent Booked Clients
                    </div>
                    {suggestions.recentBooked.map((l) => (
                      <button
                        key={l.id}
                        onMouseDown={() => pickSuggestion(l)}
                        className="w-full text-left px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2 border-b border-gray-50 dark:border-white/[0.06]"
                      >
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">
                          {l.name}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{l.phone}</span>
                        <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                      </button>
                    ))}
                  </>
                )}
                {/* Recent FC */}
                {suggestions.recentFC.length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-600 uppercase tracking-wider bg-gray-50/60 dark:bg-gray-800/10 sticky top-0 z-10">
                      🤝 Recent First Consult
                    </div>
                    {suggestions.recentFC.map((l) => (
                      <button
                        key={l.id}
                        onMouseDown={() => pickSuggestion(l)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/20 flex items-center gap-2 border-b border-gray-50 dark:border-white/[0.06]"
                      >
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">
                          {l.name}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{l.fcAppt?.date}</span>
                        <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                      </button>
                    ))}
                  </>
                )}
                {/* Recent FR */}
                {suggestions.recentFR.length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-600 uppercase tracking-wider bg-gray-50/60 dark:bg-gray-800/10 sticky top-0 z-10">
                      💰 Recent Finance Run
                    </div>
                    {suggestions.recentFR.map((l) => (
                      <button
                        key={l.id}
                        onMouseDown={() => pickSuggestion(l)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/20 flex items-center gap-2 border-b border-gray-50 dark:border-white/[0.06]"
                      >
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">
                          {l.name}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{l.frAppt?.date}</span>
                        <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                      </button>
                    ))}
                  </>
                )}
                {suggestions.recentBooked.length === 0 &&
                  suggestions.recentFC.length === 0 &&
                  suggestions.recentFR.length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-400 text-center">No recent bookings found</p>
                  )}
              </div>
            )}
          </div>

          {/* Client Phone */}
          <div>
            <label className={labelClass}>Phone</label>
            <input
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              className={inputClass}
              placeholder="04XX XXX XXX"
              type="tel"
            />
          </div>

          {/* Service Type */}
          <div>
            <label className={labelClass}>
              Service Type <span className="text-red-500">*</span>
            </label>
            <select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)} className={inputClass}>
              <option value="">— Select service type —</option>
              {categories.map((cat) =>
                byCategory(cat).length > 0 ? (
                  <optgroup key={cat} label={cat}>
                    {byCategory(cat).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.defaultDuration}min)
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )}
            </select>
          </div>

          {/* Rep */}
          <div>
            <label className={labelClass}>
              Assigned Rep <span className="text-red-500">*</span>
            </label>
            <select
              value={repId}
              onChange={(e) => setRepId(e.target.value ? Number(e.target.value) : "")}
              className={inputClass}
            >
              <option value="">— Select rep —</option>
              {bookableReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>
                Date <span className="text-red-500">*</span>
              </label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>End Time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Status section */}
          <div>
            <label className={labelClass}>Status</label>
            {/* Standard statuses */}
            <div className="flex flex-wrap gap-2 mb-2">
              {STATUS_OPTIONS.filter((o) => !o.isOutcome).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${
                    status === opt.value
                      ? "bg-amber-500 border-amber-500 text-white"
                      : "bg-white dark:bg-[var(--surface)] border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* ASG outcome statuses — only shown when editing an existing appointment */}
            {appointment && (
              <>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Appointment outcomes</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.filter((o) => o.isOutcome).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setStatus(opt.value)}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${
                        status === opt.value
                          ? "bg-slate-600 border-slate-600 text-white"
                          : "bg-gray-50 dark:bg-[var(--surface)]/50 border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-[var(--hover)]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Any additional notes..."
            />
          </div>

          {/* Link to Lead */}
          <div>
            <label className={labelClass}>Link to Lead (optional)</label>
            {linkedLead ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <span className="text-sm text-amber-800 dark:text-amber-300 flex-1">
                  {linkedLead.name} · {linkedLead.phone}
                </span>
                <button onClick={() => setLinkedLeadId(undefined)} className="text-xs text-red-500 hover:underline">
                  Unlink
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  className={inputClass}
                  placeholder="Search by name or phone..."
                />
                {leadResults.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {leadResults.map((l) => (
                      <li
                        key={l.id}
                        onClick={() => {
                          setLinkedLeadId(l.id);
                          setClientName(l.name ?? "");
                          setClientPhone(l.phone ?? "");
                          setLeadSearch("");
                        }}
                        className="px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] cursor-pointer truncate"
                      >
                        {l.name} · {l.phone} · {l.suburb}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-200 dark:border-white/[0.06]">
          {isEdit &&
            (confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Delete this appointment?</span>
                <button
                  onClick={() => onDelete(appointment!.id)}
                  className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
              >
                <Trash2 size={16} />
              </button>
            ))}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? "Saving..." : isEdit ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
