/**
 * Next Action Engine
 *
 * Deterministic, pure-function logic that decides the single most important
 * thing a sales rep should do with a lead right now.
 *
 * Used by:
 *   - DataTable     (Next Action column)
 *   - LeadSidebar   (Next Action card at top)
 *   - Dashboard     (Top 5 urgent leads)
 */

import { Lead, Appointment } from "../types";

// ── Public types ──────────────────────────────────────────────────────────────

export type NextActionType =
  | "call" // Call now
  | "followup" // Follow up (stale)
  | "callback" // Scheduled callback
  | "confirm" // Confirm appointment
  | "booked" // Booked and active
  | "settled" // Settled / complete
  | "lost" // Lost
  | "none"; // No action needed

export interface NextAction {
  label: string; // e.g. "Call now", "Follow up"
  type: NextActionType;
  priority: "high" | "medium" | "low";
  reason: string; // e.g. "No contact made", "Last call 3 days ago"
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const SETTLED_STATUSES = new Set(["settled", "lost"]);

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Returns the single highest-priority next action for a lead.
 *
 * Rules are evaluated in strict priority order — the first matching rule wins.
 */
export function getNextAction(lead: Lead, appointments: Appointment[] = []): NextAction {
  const hasContact = (lead.callHistory?.length ?? 0) > 0;
  const lastCallMs = lead.lastCall ? new Date(lead.lastCall).getTime() : 0;
  const daysSinceContact = lastCallMs > 0 ? (Date.now() - lastCallMs) / 86_400_000 : Infinity;
  const isSettled = SETTLED_STATUSES.has(lead.status) || SETTLED_STATUSES.has(lead.leadDate ?? "");
  const callbackDateValid =
    !!lead.callbackDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(lead.callbackDate) &&
    !isNaN(new Date(lead.callbackDate + "T00:00:00").getTime());
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const callbackIsOverdue =
    callbackDateValid &&
    new Date(lead.callbackDate! + "T00:00:00") < todayMidnight;

  // ── TERMINAL: Settled or lost ──────────────────────────────────────────────
  if (lead.status === "settled" || lead.settlementDate) {
    return {
      label: "Settled",
      type: "settled",
      priority: "low",
      reason: lead.settlementDate ? `Settled ${lead.settlementDate}` : "Deal settled",
    };
  }
  if (lead.status === "lost" || lead.dnqFellOver) {
    return { label: "Lost", type: "lost", priority: "low", reason: lead.dnqFellOver ? "Did not qualify" : "Lead lost" };
  }

  // ── HIGH: No contact ever ──────────────────────────────────────────────────
  if (!hasContact) {
    return { label: "Call now", type: "call", priority: "high", reason: "You haven't contacted this lead yet" };
  }

  // ── HIGH: Overdue callback ─────────────────────────────────────────────────
  if (callbackIsOverdue) {
    return {
      label: "Overdue callback",
      type: "callback",
      priority: "high",
      reason: lead.callbackTime
        ? `Callback was due ${lead.callbackDate} at ${lead.callbackTime}`
        : `Callback was due ${lead.callbackDate}`,
    };
  }

  // ── HIGH: Last contact > 2 days ────────────────────────────────────────────
  if (daysSinceContact > 2) {
    const days = Math.floor(daysSinceContact);
    return {
      label: "Follow up",
      type: "followup",
      priority: "high",
      reason: days === 3 ? "No contact in 3 days" : `No contact in ${days} days`,
    };
  }

  // ── MEDIUM: Callback scheduled (today or future) ──────────────────────────
  if (callbackDateValid) {
    return {
      label: lead.callbackTime ? `Call at ${lead.callbackTime}` : "Scheduled callback",
      type: "callback",
      priority: "medium",
      reason: lead.callbackTime
        ? `Callback on ${lead.callbackDate} at ${lead.callbackTime}`
        : `Callback scheduled for ${lead.callbackDate}`,
    };
  }

  // ── MEDIUM: Appointment booked but not confirmed ───────────────────────────
  const leadAppts = appointments.filter((a) => a.linkedLeadId === lead.id);
  const pendingAppt = leadAppts.find((a) => a.status === "pencilled-in");
  if (pendingAppt) {
    return {
      label: "Confirm appointment",
      type: "confirm",
      priority: "medium",
      reason: `Appt on ${pendingAppt.date} — awaiting confirmation`,
    };
  }

  // ── LOW: Booked and active ─────────────────────────────────────────────────
  if (lead.status === "booked" || lead.status === "Booked") {
    return {
      label: "Booked",
      type: "booked",
      priority: "low",
      reason: lead.fcAppt?.date ? `FC on ${lead.fcAppt.date}` : "Awaiting appointment",
    };
  }

  // ── NONE: All up to date ───────────────────────────────────────────────────
  return { label: "Up to date", type: "none", priority: "low", reason: "No action needed right now" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derives the most recent activity timestamp (ms) from a lead. */
export function deriveLastActivityAt(lead: Lead): number | undefined {
  const candidates: number[] = [];
  if (lead.lastCall) {
    const ts = new Date(lead.lastCall).getTime();
    if (!isNaN(ts)) candidates.push(ts);
  }
  if (lead.callHistory && lead.callHistory.length > 0) {
    const last = lead.callHistory[lead.callHistory.length - 1];
    const isNewFmt = /^\d{4}-\d{2}-\d{2}$/.test(last.date ?? "") && (!last.time || /^\d{2}:\d{2}$/.test(last.time));
    const dt = isNewFmt ? new Date(`${last.date}T${last.time || "00:00"}`) : new Date(last.time || last.date);
    if (!isNaN(dt.getTime())) candidates.push(dt.getTime());
  }
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

/** Priority sort value — lower number = higher priority */
export const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Action colours */
export const ACTION_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  high: {
    bg: "bg-red-50 dark:bg-red-900/10",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  },
  medium: {
    bg: "bg-amber-50 dark:bg-amber-900/10",
    text: "text-amber-700 dark:text-amber-400",
    badge: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  },
  low: {
    bg: "bg-green-50 dark:bg-green-900/10",
    text: "text-green-700 dark:text-green-400",
    badge: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  },
};

// ── Private helpers ───────────────────────────────────────────────────────────


function _parseCallTimestamp(date?: string, time?: string): number | undefined {
  if (!date) return undefined;
  const isNewFmt = /^\d{4}-\d{2}-\d{2}$/.test(date) && (!time || /^\d{2}:\d{2}$/.test(time));
  const dt = isNewFmt ? new Date(`${date}T${time || "00:00"}`) : new Date(time || date);
  return isNaN(dt.getTime()) ? undefined : dt.getTime();
}
