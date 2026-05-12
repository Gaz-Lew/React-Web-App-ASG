/**
 * Next Action Engine
 *
 * Deterministic, pure-function logic that decides the single most important
 * thing a sales rep should do with a lead right now.
 */

import type { Appointment, Lead } from "../types";
import { getLastContactAt, getWorkflowState } from "./workflowState";

export type NextActionType =
  | "call"
  | "followup"
  | "callback"
  | "confirm"
  | "booked"
  | "settled"
  | "lost"
  | "none";

export interface NextAction {
  label: string;
  type: NextActionType;
  priority: "high" | "medium" | "low";
  reason: string;
}

export function getNextAction(lead: Lead, appointments: Appointment[] = []): NextAction {
  if (lead.status === "settled" || lead.settlementDate || lead.dealComplete) {
    return {
      label: "Settled",
      type: "settled",
      priority: "low",
      reason: lead.settlementDate ? `Settled ${lead.settlementDate}` : "Deal settled",
    };
  }

  if (lead.status === "lost" || lead.dnqFellOver) {
    return {
      label: "Lost",
      type: "lost",
      priority: "low",
      reason: lead.dnqFellOver ? "Did not qualify" : "Lead lost",
    };
  }

  const state = getWorkflowState(lead);
  if (state.queueType === "call") {
    return { label: state.label, type: "call", priority: state.priority, reason: state.reason };
  }
  if (state.queueType === "callback") {
    return { label: state.label, type: "callback", priority: state.priority, reason: state.reason };
  }
  if (state.queueType === "followup") {
    return { label: state.label, type: "followup", priority: state.priority, reason: state.reason };
  }

  const leadAppts = appointments.filter((a) => a.linkedLeadId === lead.id);
  const pendingAppt = leadAppts.find((a) => a.status === "pencilled-in");
  if (pendingAppt) {
    return {
      label: "Confirm appointment",
      type: "confirm",
      priority: "medium",
      reason: `Appt on ${pendingAppt.date} - awaiting confirmation`,
    };
  }

  if (state.queueType === "booked" || lead.status === "booked" || lead.status === "Booked") {
    return {
      label: "Booked",
      type: "booked",
      priority: "low",
      reason: state.reason,
    };
  }

  return { label: "Up to date", type: "none", priority: "low", reason: "No action needed right now" };
}

export function deriveLastActivityAt(lead: Lead): number | undefined {
  return getLastContactAt(lead);
}

export const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

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
