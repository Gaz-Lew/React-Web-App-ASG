/**
 * learningService.ts — Read-only analytics over auditLogs.
 *
 * getActionStats — Computes per-action booking success rates for a given rep,
 *                  derived from status_change audit entries that carry a
 *                  contextAction field (written when an AI-suggested script
 *                  was used before the status change).
 *
 * Phase constraints: NO writes. Read-only. No side effects.
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

// ── Module-level cache for global stats ──────────────────────────────────────
let globalStatsCache: ActionStats[] | null = null;
let globalStatsUpdatedAt = 0;
const GLOBAL_CACHE_TTL = 5 * 60 * 1000;

// ── Public types ──────────────────────────────────────────────────────────────

export interface ActionStats {
  action: string;
  attempts: number;
  success: number;
  successRate: number;
}

export interface ActionStatsResult {
  stats: ActionStats[];
  latestTimestamp: number;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Returns success-rate stats grouped by contextAction for a given user.
 *
 * Only status_change entries are evaluated. Entries without a contextAction
 * are skipped. Actions with fewer than 3 attempts are excluded (insufficient
 * sample size). Results are sorted by successRate descending.
 *
 * Returns [] on empty data or Firestore error — never throws.
 */
export async function getActionStats(userId: string): Promise<ActionStatsResult> {
  try {
    const q = query(
      collection(db, "auditLogs"),
      where("userId", "==", userId),
      where("type", "==", "status_change"),
    );

    const snap = await getDocs(q);

    // Tally attempts and successes per contextAction; track latest timestamp
    const tally = new Map<string, { attempts: number; success: number }>();
    let latestTimestamp = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const ts = (data.timestamp as number | undefined) ?? 0;
      if (ts > latestTimestamp) latestTimestamp = ts;

      const contextAction = data.contextAction as string | undefined;
      if (!contextAction) continue;

      const newValue = data.newValue as string | undefined;
      const isSuccess = newValue === "booked";

      const prev = tally.get(contextAction) ?? { attempts: 0, success: 0 };
      tally.set(contextAction, {
        attempts: prev.attempts + 1,
        success: prev.success + (isSuccess ? 1 : 0),
      });
    }

    // Build result array — drop actions with < 3 attempts
    const stats: ActionStats[] = [];

    for (const [action, { attempts, success }] of tally) {
      if (attempts < 3) continue;
      stats.push({
        action,
        attempts,
        success,
        successRate: success / attempts, // attempts >= 3 here, no division-by-zero risk
      });
    }

    stats.sort((a, b) => b.successRate - a.successRate);

    return { stats, latestTimestamp };
  } catch (err) {
    console.warn("[learningService] getActionStats failed:", err);
    return { stats: [], latestTimestamp: 0 };
  }
}

/**
 * Returns team-wide success-rate stats grouped by contextAction.
 * Queries all users — no userId filter.
 * Actions with fewer than 5 attempts are excluded (larger sample required for global signal).
 * Results are cached for GLOBAL_CACHE_TTL to avoid redundant reads.
 * Returns [] on empty data or Firestore error — never throws.
 */
export async function getGlobalActionStats(): Promise<ActionStats[]> {
  if (globalStatsCache !== null && Date.now() - globalStatsUpdatedAt < GLOBAL_CACHE_TTL) {
    return globalStatsCache;
  }

  try {
    const q = query(
      collection(db, "auditLogs"),
      where("type", "==", "status_change"),
    );

    const snap = await getDocs(q);
    const tally = new Map<string, { attempts: number; success: number }>();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const contextAction = data.contextAction as string | undefined;
      if (!contextAction) continue;

      const newValue = data.newValue as string | undefined;
      const isSuccess = newValue === "booked";

      const prev = tally.get(contextAction) ?? { attempts: 0, success: 0 };
      tally.set(contextAction, {
        attempts: prev.attempts + 1,
        success: prev.success + (isSuccess ? 1 : 0),
      });
    }

    const stats: ActionStats[] = [];
    for (const [action, { attempts, success }] of tally) {
      if (attempts < 5) continue;
      stats.push({
        action,
        attempts,
        success,
        successRate: success / attempts,
      });
    }

    stats.sort((a, b) => b.successRate - a.successRate);

    globalStatsCache = stats;
    globalStatsUpdatedAt = Date.now();
    return stats;
  } catch (err) {
    console.warn("[learningService] getGlobalActionStats failed:", err);
    return globalStatsCache ?? [];
  }
}
