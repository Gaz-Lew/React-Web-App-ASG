/**
 * Automation Layer
 *
 * Deterministic, side-effect-free functions that compute automatic
 * field updates for a lead based on its current state.
 *
 * Run applyAutomation() after a lead loads or its activity changes.
 * If the returned object is non-empty, write the updates to Firestore.
 *
 * Pure functions only — no Firestore calls, no side effects.
 */

import { Lead } from "../types";

// ── Rule registry (used by the Automation Rules UI panel) ────────────────────

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  active: boolean;
}

export const AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "inactive-followup",
    name: "Inactive 3 days → schedule follow-up",
    description:
      "When a lead has call history but no next contact date set, and their last recorded activity was more than 3 days ago, automatically schedule a follow-up for tomorrow.",
    trigger: "Last activity > 3 days ago AND no nextContactDate set",
    action: "Set nextContactDate = tomorrow",
    active: true,
  },
];

// ── Constants ─────────────────────────────────────────────────────────────────

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Terminal statuses — automation does not act on these
const TERMINAL_STATUSES = new Set(["lost", "_deleted"]);

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Returns a (possibly empty) set of field updates to apply to the lead.
 *
 * Callers are responsible for writing these back to Firestore if non-empty.
 * This function never performs any I/O.
 *
 * @param lead - The current lead document
 */
export function applyAutomation(lead: Lead): Partial<Lead> {
  const updates: Partial<Lead> = {};

  // ── Rule: Inactive 3 days → set follow-up ────────────────────────────────
  // Conditions:
  //   1. nextContactDate is not already set (respect manual dates)
  //   2. Lead is not in a terminal status
  //   3. Lead has measurable activity (lastCall or callHistory)
  //   4. That activity is > 3 days old

  if (!lead.nextContactDate && !TERMINAL_STATUSES.has(lead.status)) {
    const lastActivity = _deriveLastActivity(lead);

    if (lastActivity > 0 && Date.now() - lastActivity > THREE_DAYS_MS) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      updates.nextContactDate = tomorrow.toISOString().split("T")[0];
    }
  }

  return updates;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Returns the most recent activity timestamp (ms epoch) from a lead's fields. */
function _deriveLastActivity(lead: Lead): number {
  let latest = 0;

  // lastCall field (ISO string)
  if (lead.lastCall) {
    const ts = new Date(lead.lastCall).getTime();
    if (!isNaN(ts)) latest = Math.max(latest, ts);
  }

  // Most recent callHistory entry
  if (lead.callHistory && lead.callHistory.length > 0) {
    const last = lead.callHistory[lead.callHistory.length - 1];
    const isNewFmt = /^\d{4}-\d{2}-\d{2}$/.test(last.date ?? "") && (!last.time || /^\d{2}:\d{2}$/.test(last.time));
    const dt = isNewFmt ? new Date(`${last.date}T${last.time || "00:00"}`) : new Date(last.time || last.date || "");
    if (!isNaN(dt.getTime())) latest = Math.max(latest, dt.getTime());
  }

  return latest;
}
