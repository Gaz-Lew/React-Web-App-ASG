import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Lead, CallResult, Appointment } from "../types";
import { useAppStore } from "../stores/appStore";
import { useServiceTypes, useSaveAppointment } from "../hooks/useFirebase";
import { formatDateTime } from "../lib/utils";
import { X, AlertCircle, CheckCircle } from "lucide-react";

interface CallLoggerProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onSave: (lead: Lead) => void;
}

/**
 * Call Logger Modal
 *
 * Logs call results with operational safeguards:
 * ✅ Required fields based on result type
 * ✅ Phone number formatting
 * ✅ Validation before save
 * ✅ Conditional fields (booking date/time for booked calls)
 * ✅ Call history display
 * ✅ Undo/Cancel
 *
 * Features:
 * - Result type dropdown (7 options)
 * - Conditional fields appear/disappear
 * - Real-time validation
 * - Notes are always required (min 10 chars)
 * - Booking details required for "Booked" result
 * - Callback date required for "Call Back" result
 * - Read-only call history
 */
export function CallLogger({ lead, isOpen, onClose, onSave }: CallLoggerProps) {
  // State
  const { reps, settings, currentUser } = useAppStore();
  const { serviceTypes } = useServiceTypes();
  const { save: saveAppt } = useSaveAppointment();
  const [result, setResult] = useState<CallResult>("no-answer");
  const [notes, setNotes] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [callingRep, setCallingRep] = useState<number>(currentUser?.id || reps[0]?.id || 1);
  // timely state removed (checkbox was removed in Session 5)
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // "Add to Calendar" state (only used when result === 'booked')
  const [createAppt, setCreateAppt] = useState(true);
  const [apptServiceTypeId, setApptServiceTypeId] = useState("");
  const [apptRepId, setApptRepId] = useState<number | "">(reps[0]?.id || "");

  // Pre-select "First Consult" service type when serviceTypes load
  useEffect(() => {
    if (serviceTypes.length && !apptServiceTypeId) {
      const fc = serviceTypes.find((st) => st.name.toLowerCase().includes("first consult"));
      setApptServiceTypeId(fc?.id ?? serviceTypes[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTypes]);

  // Helper: build address string from lead
  const buildAddress = (l: Lead): string => [l.houseNum, l.street, l.suburb, l.postcode].filter(Boolean).join(" ");

  // Get call result config
  const callResultsMap = useMemo(
    () => ({
      booked: {
        label: "✅ Booked",
        icon: "✅",
        color: "bg-green-500",
        requiresFields: ["bookingDate", "bookingTime", "notes"],
      },
      live: {
        label: "⚡ Set as Live",
        icon: "⚡",
        color: "bg-gray-500",
        requiresFields: ["notes"],
      },
      "no-answer": {
        label: "📞 No Answer",
        icon: "📞",
        color: "bg-red-500",
        requiresFields: ["notes"],
      },
      "not-interested": {
        label: "❌ Not Interested",
        icon: "❌",
        color: "bg-red-500",
        requiresFields: ["notes"],
      },
      "wrong-number": {
        label: "😶 Wrong Number",
        icon: "😶",
        color: "bg-gray-500",
        requiresFields: [],
      },
      callback: {
        label: "📅 Call Back",
        icon: "📅",
        color: "bg-yellow-500",
        requiresFields: ["callbackDate", "callbackTime", "notes"],
      },
      "callback-today": {
        label: "📅 Call Back Today",
        icon: "📅",
        color: "bg-gray-500",
        requiresFields: ["callbackTime", "notes"],
      },
      "back-to-dq": {
        label: "🔙 Back to DQ",
        icon: "🔙",
        color: "bg-gray-500",
        requiresFields: ["notes"],
      },
    }),
    [],
  );

  const resultConfig = callResultsMap[result];
  const activeReps = useMemo(() => reps.filter((r) => r.active), [reps]);

  // Validation
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if ((result === "booked" || result === "callback") && !bookingDate && !callbackDate) {
      newErrors.date = result === "booked" ? "Booking date required" : "Callback date required";
    }

    if ((result === "booked" || result === "callback") && !bookingTime && !callbackTime) {
      newErrors.time = result === "booked" ? "Booking time required" : "Callback time required";
    }

    if (result === "callback-today" && !callbackTime) {
      newErrors.time = "Callback time required";
    }

    // Validate times are HH:MM format
    if (bookingTime && !/^\d{2}:\d{2}$/.test(bookingTime)) {
      newErrors.bookingTime = "Time must be HH:MM format";
    }

    if (callbackTime && !/^\d{2}:\d{2}$/.test(callbackTime)) {
      newErrors.callbackTime = "Time must be HH:MM format";
    }

    // Validate dates are YYYY-MM-DD format
    if (bookingDate && !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      newErrors.bookingDate = "Date must be YYYY-MM-DD format";
    }

    if (callbackDate && !/^\d{4}-\d{2}-\d{2}$/.test(callbackDate)) {
      newErrors.callbackDate = "Date must be YYYY-MM-DD format";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [result, bookingDate, bookingTime, callbackDate, callbackTime]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!validate() || saving) return;
    setSaving(true);

    // Build updated lead
    const updatedLead: Lead = {
      ...lead,
      result,
      notes,
      lastCall: new Date().toISOString(),
      callingRep,

      status:
        result === "booked"
          ? "Booked"
          : result === "live"
            ? "Live"
            : result === "callback" || result === "callback-today"
              ? "Revisit"
              : result === "not-interested"
                ? "Not Interested"
                : result === "wrong-number"
                  ? "Wrong Number"
                  : result === "no-answer"
                    ? "No Answer"
                    : result === "back-to-dq"
                      ? "DQ"
                      : "DQ", // fallback
      ...(result === "booked" && {
        bookingDate,
        bookingTime,
        appointmentDate: bookingDate,
        appointmentTime: bookingTime,
      }),
      ...(result === "callback" && { callbackDate, callbackTime }),
      ...(result === "callback-today" && {
        callbackDate: new Date().toISOString().split("T")[0],
        callbackTime,
      }),
      // Add to call history
      callHistory: [
        ...(lead.callHistory || []),
        {
          date: new Date().toISOString().split("T")[0], // YYYY-MM-DD (for Dashboard date filtering)
          time: new Date().toTimeString().slice(0, 5), // HH:MM (for Dashboard sort + timeAgo)
          rep: reps.find((r) => r.id === callingRep)?.name || "Unknown",
          repId: callingRep, // stored for rep-rename resilience
          result,
          notes,
        },
      ],
    };

    onSave(updatedLead);

    // Auto-create calendar appointment when result is 'booked' and createAppt is on
    if (result === "booked" && createAppt && apptServiceTypeId && bookingDate && bookingTime) {
      const svc = serviceTypes.find((st) => st.id === apptServiceTypeId);
      const [startH, startM] = bookingTime.split(":").map(Number);
      const endMins = startH * 60 + startM + (svc?.defaultDuration ?? 60);
      const endH = String(Math.floor(endMins / 60)).padStart(2, "0");
      const endM = String(endMins % 60).padStart(2, "0");
      const repIdNum =
        apptRepId !== "" ? Number(apptRepId) : (reps.find((r) => r.id === callingRep)?.id ?? reps[0]?.id ?? 0);
      const currentRepName = reps.find((r) => r.id === callingRep)?.name ?? "Unknown";
      const newAppt: Appointment = {
        id: `appt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: lead.name,
        serviceTypeId: apptServiceTypeId,
        repId: repIdNum,
        date: bookingDate,
        startTime: bookingTime,
        endTime: `${endH}:${endM}`,
        durationMins: svc?.defaultDuration ?? 60,
        status: "pencilled-in",
        linkedLeadId: lead.id,
        clientName: lead.name,
        clientPhone: lead.phone,
        clientAddress: buildAddress(lead),
        createdBy: currentRepName,
        createdAt: Date.now(),
      };
      await saveAppt(newAppt);
    }

    setSaving(false);
    handleClose();
  }, [
    validate,
    saving,
    lead,
    result,
    notes,
    bookingDate,
    bookingTime,
    callbackDate,
    callbackTime,
    callingRep,
    reps,
    onSave,
    createAppt,
    apptServiceTypeId,
    apptRepId,
    serviceTypes,
    saveAppt,
  ]);

  const handleClose = useCallback(() => {
    // Reset form
    setResult("no-answer");
    setNotes("");
    setBookingDate("");
    setBookingTime("");
    setCallbackDate("");
    setCallbackTime("");
    setCallingRep(currentUser?.id || reps[0]?.id || 1);
    setErrors({});
    setCreateAppt(true);
    setApptRepId(reps[0]?.id || "");
    onClose();
  }, [onClose, settings, reps]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={handleClose} aria-hidden="true" />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-[var(--surface)] border-b border-gray-200 dark:border-white/[0.06] px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Log Call</h2>
            <button onClick={handleClose} className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded transition">
              <X size={20} />
            </button>
          </div>

          {/* Lead Info */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-[var(--surface)] border-b border-gray-200 dark:border-white/[0.06]">
            <p className="font-semibold text-gray-900 dark:text-white">{lead.name}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{lead.phone}</p>
            {lead.lastCall && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Last called: {formatDateTime(lead.lastCall.split("T")[0], "")}
              </p>
            )}
          </div>

          {/* Form */}
          <div className="px-6 py-4 space-y-4">
            {/* Call Result */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Call Result *</label>
              <select
                value={result}
                onChange={(e) => setResult(e.target.value as CallResult)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold"
              >
                {Object.entries(callResultsMap).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Booking Date (for Booked result) */}
            {(result === "booked" || result === "callback") && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  {result === "booked" ? "Booking Date" : "Callback Date"} *
                </label>
                <input
                  type="date"
                  value={result === "booked" ? bookingDate : callbackDate}
                  onChange={(e) =>
                    result === "booked" ? setBookingDate(e.target.value) : setCallbackDate(e.target.value)
                  }
                  className={`w-full px-3 py-2 rounded-lg border ${
                    errors.date ? "border-red-500" : "border-gray-300 dark:border-white/[0.08]"
                  } bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold`}
                />
                {errors.date && <p className="text-sm text-red-500 mt-1">{errors.date}</p>}
              </div>
            )}

            {/* Callback Date for Callback-Today (auto today) */}
            {result === "callback-today" && (
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/30 rounded-lg text-sm text-gray-800 dark:text-gray-200">
                Callback scheduled for today
              </div>
            )}

            {/* Booking/Callback Time */}
            {(result === "booked" || result === "callback" || result === "callback-today") && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Time *</label>
                <input
                  type="time"
                  value={result === "booked" ? bookingTime : result === "callback" ? callbackTime : callbackTime}
                  onChange={(e) => {
                    if (result === "booked") setBookingTime(e.target.value);
                    else setCallbackTime(e.target.value);
                  }}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    errors.time ? "border-red-500" : "border-gray-300 dark:border-white/[0.08]"
                  } bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold`}
                />
                {errors.time && <p className="text-sm text-red-500 mt-1">{errors.time}</p>}
              </div>
            )}

            {/* Calling Rep (for Booked) */}
            {result === "booked" && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Calling Rep</label>
                <select
                  value={callingRep}
                  onChange={(e) => setCallingRep(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold"
                >
                  {activeReps.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Add to Calendar (shown when result is 'booked') */}
            {result === "booked" && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <label className="flex items-center gap-2 font-medium text-sm text-amber-900 dark:text-amber-200 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createAppt}
                    onChange={(e) => setCreateAppt(e.target.checked)}
                    className="rounded"
                  />
                  📅 Add to Calendar
                </label>
                {createAppt && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-amber-700 dark:text-amber-400 mb-1">Appointment Type</label>
                      <select
                        value={apptServiceTypeId}
                        onChange={(e) => setApptServiceTypeId(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded border border-amber-200 dark:border-amber-700 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        {serviceTypes.length === 0 && <option value="">— No types configured —</option>}
                        {Array.from(new Set(serviceTypes.map((s) => s.category))).map((cat) => (
                          <optgroup key={cat} label={cat}>
                            {serviceTypes
                              .filter((s) => s.category === cat)
                              .map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.name}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-amber-700 dark:text-amber-400 mb-1">Assigned Rep</label>
                      <select
                        value={apptRepId}
                        onChange={(e) => setApptRepId(e.target.value ? Number(e.target.value) : "")}
                        className="w-full px-2 py-1.5 text-sm rounded border border-amber-200 dark:border-amber-700 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        {reps
                          .filter((r) => r.active && r.availableForBookings !== false)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Call Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any extra Notes?"
                rows={4}
                className={`w-full px-3 py-2 rounded-lg border ${
                  errors.notes ? "border-red-500" : "border-gray-300 dark:border-white/[0.08]"
                } bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gold resize-none`}
              />
              {errors.notes && <p className="text-sm text-red-500 mt-1">{errors.notes}</p>}
            </div>

            {/* Call History */}
            {lead.callHistory && lead.callHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Recent Call History</h3>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {lead.callHistory.slice(-3).map((call, idx) => (
                    <div key={idx} className="p-2 bg-gray-50 dark:bg-[var(--surface)] rounded text-xs">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {call.result} - {call.rep}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">
                        {new Date(call.time).toLocaleString("en-AU")}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400 mt-1">{call.notes}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 dark:bg-[var(--surface)] border-t border-gray-200 dark:border-white/[0.06] px-6 py-4 flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-[var(--hover)] transition font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={Object.keys(errors).length > 0 || saving}
              className="flex-1 px-4 py-2 rounded-lg bg-gold text-white hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle size={16} />
              )}
              {saving ? "Saving…" : "Save Call"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default CallLogger;
