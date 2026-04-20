/**
 * usePerfAlerts.ts — Real-time performance alert computation
 *
 * Computes which performance alerts should be shown to the currently logged-in rep
 * based on time of day and their activity levels today.
 *
 * Alert types:
 *  - no_activity:    No calls logged by 12:00 local time
 *  - low_activity:   Calls below 50% of daily target by 15:00 local time
 *  - target_nearing: Calls >= 80% of daily target (positive nudge)
 *  - missed_target:  End of day (after 17:00) and still below daily target
 *
 * Only triggers if rep.alertsEnabled === true.
 * Returns alerts + dismissal function.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppStore } from "../stores/appStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PerfAlertType =
  | "no_activity"
  | "low_activity"
  | "target_nearing"
  | "missed_target";

export interface PerfAlert {
  type: PerfAlertType;
  message: string;
  severity: "info" | "warning" | "error";
  timestamp: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns today's date as "YYYY-MM-DD" in local time */
function getLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * usePerfAlerts
 *
 * Evaluates performance alert conditions every 60 seconds against the current
 * time and the rep's call activity for today.
 *
 * Only active when `currentUser.alertsEnabled === true`.
 */
export function usePerfAlerts(): {
  alerts: PerfAlert[];
  dismiss: (type: PerfAlertType) => void;
  hasAlerts: boolean;
} {
  // ── Store ──────────────────────────────────────────────────────────────────
  const leads = useAppStore((s) => s.leads);
  const currentUser = useAppStore((s) => s.currentUser);
  const settings = useAppStore((s) => s.settings);

  // ── Live clock — refreshed every 60 seconds ────────────────────────────────
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Dismissed alert IDs — reset when the calendar day rolls over ───────────
  const todayStr = getLocalDateString(now);

  const [dismissed, setDismissed] = useState<{
    date: string;
    types: Set<PerfAlertType>;
  }>({ date: todayStr, types: new Set() });

  // If day has changed, clear dismissals
  const activeDismissed = useMemo<Set<PerfAlertType>>(() => {
    if (dismissed.date !== todayStr) {
      return new Set<PerfAlertType>();
    }
    return dismissed.types;
  }, [dismissed, todayStr]);

  // Persist updated dismissed set when day rolls over
  useEffect(() => {
    if (dismissed.date !== todayStr) {
      setDismissed({ date: todayStr, types: new Set() });
    }
  }, [todayStr, dismissed.date]);

  // ── Dismiss handler ────────────────────────────────────────────────────────
  const dismiss = useCallback(
    (type: PerfAlertType) => {
      setDismissed((prev) => {
        const updated = new Set(prev.types);
        updated.add(type);
        return { date: todayStr, types: updated };
      });
    },
    [todayStr]
  );

  // ── Alert computation ──────────────────────────────────────────────────────
  const alerts = useMemo<PerfAlert[]>(() => {
    // Guard: only compute if currentUser has alertsEnabled
    if (!currentUser) return [];

    // alertsEnabled is an optional field on Rep — treat absence as false
    if (!currentUser.alertsEnabled) return [];

    const currentHour = now.getHours();
    const ts = now.getTime();

    // Daily target = ceil(weeklyDQ / 5) — fallback to 20/5 = 4 if unset
    const repTarget = settings.repTargets[currentUser.id];
    const weeklyDQ = repTarget?.weeklyDQ ?? 20;
    const dailyTarget = Math.ceil(weeklyDQ / 5);

    // Count calls made today by this rep
    const callsToday = leads
      .flatMap((l) => l.callHistory ?? [])
      .filter(
        (c) =>
          c.repId === currentUser.id &&
          c.date === todayStr
      ).length;

    const computed: PerfAlert[] = [];

    // no_activity: no calls by noon
    if (currentHour >= 12 && callsToday === 0) {
      computed.push({
        type: "no_activity",
        message: "No calls logged yet today — check in with your leads!",
        severity: "warning",
        timestamp: ts,
      });
    }

    // low_activity: below 50% of target by 3 pm
    if (currentHour >= 15 && callsToday < dailyTarget * 0.5) {
      computed.push({
        type: "low_activity",
        message: `Only ${callsToday} calls logged — you need ${
          dailyTarget - callsToday
        } more to hit today's target.`,
        severity: "warning",
        timestamp: ts,
      });
    }

    // target_nearing: >= 80% but not yet at target (positive nudge)
    if (callsToday >= dailyTarget * 0.8 && callsToday < dailyTarget) {
      const remaining = dailyTarget - callsToday;
      computed.push({
        type: "target_nearing",
        message: `Great work! ${remaining} more call${
          remaining === 1 ? "" : "s"
        } to hit your target today.`,
        severity: "info",
        timestamp: ts,
      });
    }

    // missed_target: after 5 pm and still below target
    if (currentHour >= 17 && callsToday < dailyTarget) {
      computed.push({
        type: "missed_target",
        message: `Today's target missed. ${callsToday}/${dailyTarget} calls. Keep it up tomorrow!`,
        severity: "error",
        timestamp: ts,
      });
    }

    // Filter out dismissed alerts
    return computed.filter((a) => !activeDismissed.has(a.type));
  }, [now, currentUser, settings, leads, todayStr, activeDismissed]);

  return {
    alerts,
    dismiss,
    hasAlerts: alerts.length > 0,
  };
}
