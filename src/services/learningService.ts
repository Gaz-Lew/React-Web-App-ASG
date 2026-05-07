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
import type { Region } from "../types";

// ── Module-level cache for global stats (keyed by region) ────────────────────
const globalStatsCacheByRegion: Partial<Record<Region, ActionStats[]>> = {};
const globalStatsUpdatedAtByRegion: Partial<Record<Region, number>> = {};
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
export async function getActionStats(userId: string, region: Region): Promise<ActionStatsResult> {
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

      // Strict region filter — backfill guarantees all docs have region.
      const entryRegion = data.region as string | undefined;
      if (entryRegion !== region) continue;

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
export async function getGlobalActionStats(region: Region): Promise<ActionStats[]> {
  const cached = globalStatsCacheByRegion[region];
  const cachedAt = globalStatsUpdatedAtByRegion[region] ?? 0;
  if (cached !== undefined && Date.now() - cachedAt < GLOBAL_CACHE_TTL) {
    return cached;
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

      // Strict region filter — backfill guarantees all docs have region.
      const entryRegion = data.region as string | undefined;
      if (entryRegion !== region) continue;

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

    globalStatsCacheByRegion[region] = stats;
    globalStatsUpdatedAtByRegion[region] = Date.now();
    return stats;
  } catch (err) {
    console.warn("[learningService] getGlobalActionStats failed:", err);
    return globalStatsCacheByRegion[region] ?? [];
  }
}
