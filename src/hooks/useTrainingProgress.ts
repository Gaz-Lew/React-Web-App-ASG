/**
 * useTrainingProgress.ts — Per-user training progression tracker
 *
 * Derives all stats from an existing sessions array (from useTrainingSessions).
 * Pure useMemo — no extra Firestore listeners.
 *
 * Returns:
 *  - Overview:  totalSessions, avgScore, bestScore, recentTrend
 *  - Weekly:    sessionsThisWeek, weeklyTarget, weeklyPct
 *  - Skills:    avgOH, avgQ, avgC (last 10 sessions)
 *  - Unlock:    hardUnlocked, mediumUnlocked
 *  - Level:     starter → developing → proficient → expert
 *  - Weakness:  weakestSkill
 */

import { useMemo } from "react";
import type { RoleplaySession } from "../types";

export type ProgressLevel = "starter" | "developing" | "proficient" | "expert";
export type TrendDirection = "improving" | "declining" | "stable" | "insufficient";
export type WeakSkill = "objectionHandling" | "questioning" | "closing" | null;

export interface TrainingProgress {
  // Overview
  totalSessions: number;
  avgScore: number;        // 0–40
  bestScore: number;       // 0–40
  recentTrend: TrendDirection;

  // Weekly
  sessionsThisWeek: number;
  weeklyTarget: number;    // from Firestore settings (default 3)
  weeklyPct: number;       // 0–100

  // Skill averages (last 10 sessions)
  avgOH: number;   // objection handling / 15
  avgQ: number;    // questioning / 15
  avgC: number;    // closing / 10

  // Progression
  hardUnlocked: boolean;   // avgScore ≥ minimumScoreTarget OR ≥ 5 sessions
  mediumUnlocked: boolean; // always true after first session
  level: ProgressLevel;
  levelLabel: string;
  xpToNextLevel: number;   // sessions still needed for next level (0 = max)

  // Weakness
  weakestSkill: WeakSkill;
  weakestSkillLabel: string;
}

// Fallback constants (used when called without settings — safe defaults)
const DEFAULT_WEEKLY_TARGET = 3;
const DEFAULT_MIN_SCORE = 28;

const LEVEL_LABELS: Record<ProgressLevel, string> = {
  starter: "Starter",
  developing: "Developing",
  proficient: "Proficient",
  expert: "Expert",
};

/** Monday of the current week at midnight local time */
function getWeekStart(): number {
  const d = new Date();
  const day = d.getDay() || 7; // 1=Mon … 7=Sun
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 1, 0, 0, 0, 0).getTime();
}

/**
 * @param sessions       Sessions array from useTrainingSessions
 * @param weeklyTarget   Override from Firestore settings (defaults to 3)
 * @param minimumScore   Hard-mode unlock score threshold (defaults to 28)
 */
export function useTrainingProgress(
  sessions: RoleplaySession[],
  weeklyTarget: number = DEFAULT_WEEKLY_TARGET,
  minimumScore: number = DEFAULT_MIN_SCORE,
): TrainingProgress {
  return useMemo(() => {
    const totalSessions = sessions.length;
    const weekStart = getWeekStart();
    const wt = weeklyTarget > 0 ? weeklyTarget : DEFAULT_WEEKLY_TARGET;
    const ms = minimumScore > 0 ? minimumScore : DEFAULT_MIN_SCORE;

    // ── Weekly ──────────────────────────────────────────────────────────────
    const sessionsThisWeek = sessions.filter((s) => s.completedAt >= weekStart).length;
    const weeklyPct = Math.min(100, Math.round((sessionsThisWeek / wt) * 100));

    // ── Overview ─────────────────────────────────────────────────────────────
    const totals = sessions.map((s) => s.score?.total ?? 0);
    const avgScore =
      totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    const bestScore = totals.length > 0 ? Math.max(...totals) : 0;

    // ── Trend (last 5 vs previous 5) ─────────────────────────────────────────
    let recentTrend: TrendDirection = "insufficient";
    if (sessions.length >= 6) {
      const last5 = totals.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const prev = totals.slice(5, 10);
      const prev5 = prev.reduce((a, b) => a + b, 0) / prev.length;
      const delta = last5 - prev5;
      recentTrend = delta >= 2 ? "improving" : delta <= -2 ? "declining" : "stable";
    }

    // ── Skill averages (last 10) ──────────────────────────────────────────────
    const last10 = sessions.slice(0, 10);
    const n = last10.length || 1;
    const avgOH = last10.reduce((s, x) => s + (x.score?.objectionHandling ?? 0), 0) / n;
    const avgQ  = last10.reduce((s, x) => s + (x.score?.questioning ?? 0), 0) / n;
    const avgC  = last10.reduce((s, x) => s + (x.score?.closing ?? 0), 0) / n;

    // ── Weakest skill ─────────────────────────────────────────────────────────
    let weakestSkill: WeakSkill = null;
    let weakestSkillLabel = "";
    if (last10.length >= 3) {
      const ohPct = (avgOH / 15) * 100;
      const qPct  = (avgQ  / 15) * 100;
      const cPct  = (avgC  / 10) * 100;
      const min   = Math.min(ohPct, qPct, cPct);
      if (min === ohPct) { weakestSkill = "objectionHandling"; weakestSkillLabel = "Objection Handling"; }
      else if (min === qPct) { weakestSkill = "questioning"; weakestSkillLabel = "Questioning"; }
      else { weakestSkill = "closing"; weakestSkillLabel = "Closing"; }
    }

    // ── Unlock logic ──────────────────────────────────────────────────────────
    const mediumUnlocked = totalSessions >= 1;
    const hardUnlocked   = totalSessions >= 5 || avgScore >= ms;

    // ── Level ─────────────────────────────────────────────────────────────────
    let level: ProgressLevel;
    let xpToNextLevel = 0;

    if (avgScore >= 32 || (avgScore >= 28 && totalSessions >= 10)) {
      level = "expert";
      xpToNextLevel = 0;
    } else if (avgScore >= 24 || totalSessions >= 5) {
      level = "proficient";
      // Need avg ≥ 32 or 10 sessions
      xpToNextLevel = Math.max(0, 10 - totalSessions);
    } else if (avgScore >= 14 || totalSessions >= 2) {
      level = "developing";
      // Need avg ≥ 24 or 5 sessions
      xpToNextLevel = Math.max(0, 5 - totalSessions);
    } else {
      level = "starter";
      // Need 2 sessions to develop
      xpToNextLevel = Math.max(0, 2 - totalSessions);
    }

    return {
      totalSessions,
      avgScore,
      bestScore,
      recentTrend,
      sessionsThisWeek,
      weeklyTarget: wt,
      weeklyPct,
      avgOH,
      avgQ,
      avgC,
      hardUnlocked,
      mediumUnlocked,
      level,
      levelLabel: LEVEL_LABELS[level],
      xpToNextLevel,
      weakestSkill,
      weakestSkillLabel,
    };
  }, [sessions, weeklyTarget, minimumScore]);
}

export default useTrainingProgress;
