/**
 * Follow-Up Engine utilities
 *
 * Pure functions for evaluating nextContactDate on a lead.
 * No side effects — safe to call during render.
 */

/**
 * Returns true when the given ISO date string is strictly in the past
 * (before today's calendar date).
 */
export function isOverdue(date?: string): boolean {
  if (!date) return false;
  const today = new Date().toISOString().split("T")[0];
  return date < today;
}

/**
 * Returns true when the given ISO date string matches today's calendar date.
 */
export function isDueToday(date?: string): boolean {
  if (!date) return false;
  const today = new Date().toISOString().split("T")[0];
  return date === today;
}

/**
 * Returns a human-readable short label for a future follow-up date.
 * e.g. "5 Apr" or "Tomorrow"
 */
export function formatFollowUpDate(date?: string): string {
  if (!date) return "";
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (date === tomorrow) return "Tomorrow";
  return new Date(date + "T00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}
