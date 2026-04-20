/**
 * RoleplayDashboard.tsx — AI Roleplay performance tracker
 *
 * Shows per-rep stats pulled from the `trainingSessions` Firestore collection:
 *  - Session history with scores
 *  - Score trend (last 10 sessions, CSS bar chart)
 *  - Skill breakdown (objectionHandling / questioning / closing)
 *  - Weakness detection + scenario recommendations
 *  - Admin view: all reps summary table
 */

import React, { useMemo, useState } from "react";
import { useTrainingSessions } from "../hooks/useFirebase";
import { useTrainingProgress } from "../hooks/useTrainingProgress";
import { useAppSettings } from "../hooks/useAppSettings";
import { useAppStore } from "../stores/appStore";
import { RoleplaySession } from "../types";
import { RoleplayReplay } from "./RoleplayReplay";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  AlertCircle,
  BarChart2,
  Clock,
  RefreshCw,
  BookOpen,
  Zap,
  CheckCircle,
  Eye,
} from "lucide-react";

// ── Score max values ──────────────────────────────────────────────────────────
const SCORE_MAX = { objectionHandling: 15, questioning: 15, closing: 10, total: 40 };

const SCENARIO_LABELS: Record<string, string> = {
  booking_call: "Booking Call",
  door_knock: "Door Knock",
  first_consult: "First Consult",
  follow_up: "Follow Up",
  property_sale: "Property Sale",
};

const DIFFICULTY_BADGE: Record<string, string> = {
  easy: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  medium: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  hard: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(pct: number): string {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-red-500";
}

function scoreTextColor(pct: number): string {
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

// ── Skill Bar ─────────────────────────────────────────────────────────────────

function SkillBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-[#3d3d39] dark:text-[#c8c8c2]">{label}</span>
        <span className={`text-xs font-bold ${scoreTextColor(pct)}`}>
          {value}/{max} <span className="font-normal text-[#8a8a84]">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#e2e2de] dark:bg-[#2e2e2b] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Trend Chart (CSS bars) ────────────────────────────────────────────────────

function TrendChart({ sessions }: { sessions: RoleplaySession[] }) {
  const recent = sessions.slice(0, 10).reverse(); // oldest → newest left to right
  if (recent.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-[#6b6b65] dark:text-[#8a8a84] uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <TrendingUp size={12} /> Score Trend (last {recent.length} sessions)
      </h3>
      <div className="flex items-end gap-1.5 h-20">
        {recent.map((s, i) => {
          const pct = Math.round(((s.score?.total ?? 0) / SCORE_MAX.total) * 100);
          return (
            <div
              key={s.id ?? i}
              className="flex-1 flex flex-col items-center justify-end gap-0.5 group"
              title={`${fmtDate(s.completedAt)} — ${s.score?.total ?? 0}/${SCORE_MAX.total}`}
            >
              <span className="text-[9px] text-[#8a8a84] group-hover:text-[#b8933a] transition">
                {s.score?.total ?? 0}
              </span>
              <div
                className={`w-full rounded-t ${scoreColor(pct)} opacity-80 group-hover:opacity-100 transition-all`}
                style={{ height: `${Math.max(pct, 5)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-[#8a8a84]">
        <span>{recent.length > 0 ? fmtDate(recent[0].completedAt) : ""}</span>
        <span>{recent.length > 1 ? fmtDate(recent[recent.length - 1].completedAt) : ""}</span>
      </div>
    </div>
  );
}

// ── Progression Badge ─────────────────────────────────────────────────────────

const LEVEL_COLORS = {
  starter: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  developing: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  proficient: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  expert: "bg-[#b8933a]/15 text-[#b8933a] border border-[#b8933a]/30",
};

function ProgressionBadge({ level, label }: { level: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${LEVEL_COLORS[level as keyof typeof LEVEL_COLORS] ?? LEVEL_COLORS.starter}`}
    >
      <Zap size={10} /> {label}
    </span>
  );
}

// ── Weekly Progress Bar ───────────────────────────────────────────────────────

function WeeklyBar({ done, target }: { done: number; target: number }) {
  const pct = Math.min(100, Math.round((done / target) * 100));
  const complete = done >= target;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[#3d3d39] dark:text-[#c8c8c2] flex items-center gap-1.5">
          <Clock size={11} /> This week
        </span>
        <span className={`font-bold ${complete ? "text-green-600 dark:text-green-400" : "text-[#8a8a84]"}`}>
          {done}/{target} sessions {complete && "✓"}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[#e2e2de] dark:bg-[#2e2e2b] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${complete ? "bg-green-500" : pct >= 66 ? "bg-amber-400" : "bg-purple-500"}`}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
    </div>
  );
}

// ── Weakness Detector + Recommendations ───────────────────────────────────────

function WeaknessPanel({ sessions }: { sessions: RoleplaySession[] }) {
  const recommendations = useMemo(() => {
    if (sessions.length < 3) return null;

    const last10 = sessions.slice(0, 10);
    const avgOH = last10.reduce((s, x) => s + (x.score?.objectionHandling ?? 0), 0) / last10.length;
    const avgQ = last10.reduce((s, x) => s + (x.score?.questioning ?? 0), 0) / last10.length;
    const avgC = last10.reduce((s, x) => s + (x.score?.closing ?? 0), 0) / last10.length;

    const ohPct = (avgOH / SCORE_MAX.objectionHandling) * 100;
    const qPct = (avgQ / SCORE_MAX.questioning) * 100;
    const cPct = (avgC / SCORE_MAX.closing) * 100;

    const recs: { skill: string; tip: string; scenario: string; pct: number }[] = [];

    if (ohPct < 60)
      recs.push({
        skill: "Objection Handling",
        tip: "Use the Acknowledge → Reframe → Redirect pattern. Never argue — validate first.",
        scenario: "Try: Door Knock (Hard) or Booking Call (Hard)",
        pct: ohPct,
      });
    if (qPct < 60)
      recs.push({
        skill: "Discovery Questioning",
        tip: "Aim for at least one question every 2 exchanges. Lead with curiosity.",
        scenario: "Try: First Consult — use the Discovery Framework script",
        pct: qPct,
      });
    if (cPct < 60)
      recs.push({
        skill: "Closing",
        tip: "Offer two specific time options — don't ask if, ask when.",
        scenario: "Try: Follow Up or Property Sale scenarios",
        pct: cPct,
      });

    return recs.length > 0 ? recs : null;
  }, [sessions]);

  if (!recommendations) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-xl px-4 py-3">
        <CheckCircle size={16} />
        <span>No significant weaknesses detected in your recent sessions. Keep it up!</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recommendations.map((r) => (
        <div
          key={r.skill}
          className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200/60 dark:border-amber-700/30 rounded-xl px-4 py-3 space-y-1"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={13} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex-1">{r.skill}</p>
            <span className={`text-xs font-bold ${scoreTextColor(r.pct)}`}>{Math.round(r.pct)}%</span>
          </div>
          <p className="text-xs text-[#6b6b65] dark:text-[#8a8a84] pl-5">{r.tip}</p>
          <p className="text-[11px] text-purple-600 dark:text-purple-400 pl-5 flex items-center gap-1">
            <BookOpen size={10} /> {r.scenario}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Session History Row ───────────────────────────────────────────────────────

function SessionRow({
  session,
  onView,
  replayEnabled,
}: {
  session: RoleplaySession;
  onView: (s: RoleplaySession) => void;
  replayEnabled: boolean;
}) {
  const total = session.score?.total ?? 0;
  const pct = Math.round((total / SCORE_MAX.total) * 100);

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-[#f7f7f5] dark:hover:bg-white/[0.03] transition border border-transparent hover:border-[#e2e2de] dark:hover:border-white/[0.06]">
      {/* Score badge */}
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${scoreColor(pct)}`}
      >
        {total}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#1a1a18] dark:text-[#f0f0ee] truncate">
          {SCENARIO_LABELS[session.scenarioType] ?? session.scenarioType}
        </p>
        <p className="text-[11px] text-[#8a8a84] flex items-center gap-1">
          <Clock size={10} />
          {fmtDate(session.completedAt)} at {fmtTime(session.completedAt)}
        </p>
      </div>
      {/* Difficulty badge */}
      {session.difficulty && (
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_BADGE[session.difficulty] ?? DIFFICULTY_BADGE.medium}`}
        >
          {session.difficulty}
        </span>
      )}
      {/* Skill scores */}
      <div className="hidden sm:flex gap-2 text-[10px] text-[#8a8a84]">
        <span title="Objection Handling">OH: {session.score?.objectionHandling ?? 0}</span>
        <span title="Questioning">Q: {session.score?.questioning ?? 0}</span>
        <span title="Closing">C: {session.score?.closing ?? 0}</span>
      </div>
      {/* View replay button — only when feature enabled + session has messages */}
      {replayEnabled && session.messages && session.messages.length > 0 && (
        <button
          onClick={() => onView(session)}
          title="Replay this session"
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40 transition flex-shrink-0"
        >
          <Eye size={11} /> View
        </button>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface Props {
  /** Pass a repId to show that rep's sessions. Null = current user. */
  repId?: number | null;
}

const TREND_ICON = {
  improving: <TrendingUp size={12} className="text-green-500" />,
  declining: <TrendingDown size={12} className="text-red-500" />,
  stable: <Minus size={12} className="text-amber-500" />,
  insufficient: null,
};

const TREND_LABEL = {
  improving: "Improving",
  declining: "Declining",
  stable: "Stable",
  insufficient: "Not enough data",
};

export function RoleplayDashboard({ repId: propRepId }: Props = {}) {
  const { currentUser } = useAppStore();
  const isAdmin = currentUser?.role === "admin";

  const targetRepId = propRepId !== undefined ? propRepId : (currentUser?.id ?? null);
  const { sessions, loading } = useTrainingSessions(targetRepId);

  // Pull live settings from Firestore — drives weekly target + unlock threshold
  const { config: appConfig } = useAppSettings();

  // All progress stats derived via memo — targets driven by Firestore settings
  const progress = useTrainingProgress(
    sessions,
    appConfig.trainingSettings.weeklyTargetSessions,
    appConfig.trainingSettings.minimumScoreTarget,
  );

  // ── Session replay modal state ────────────────────────────────────────────
  const [selectedSession, setSelectedSession] = useState<RoleplaySession | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#8a8a84]">
        <RefreshCw size={18} className="animate-spin mr-2" /> Loading sessions…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart2 size={32} className="mx-auto mb-3 text-[#c8c8c2] dark:text-[#3d3d39]" />
        <p className="text-sm font-semibold text-[#3d3d39] dark:text-[#c8c8c2]">No sessions yet</p>
        <p className="text-xs text-[#8a8a84] mt-1">Complete an AI Role-Play session to see your progress here.</p>
      </div>
    );
  }

  const avgPct = Math.round((progress.avgScore / SCORE_MAX.total) * 100);
  const bestPct = Math.round((progress.bestScore / SCORE_MAX.total) * 100);

  return (
    <div className="space-y-5">
      {/* ── Progression header ── */}
      <div className="bg-[#fafaf8] dark:bg-[#1e1e1c] border border-[#e2e2de] dark:border-[#2e2e2b] rounded-2xl p-4 space-y-3">
        {/* Level + trend row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ProgressionBadge level={progress.level} label={progress.levelLabel} />
            {progress.xpToNextLevel > 0 && (
              <span className="text-[11px] text-[#8a8a84]">
                {progress.xpToNextLevel} session{progress.xpToNextLevel !== 1 ? "s" : ""} to next level
              </span>
            )}
          </div>
          {progress.recentTrend !== "insufficient" && (
            <span className="flex items-center gap-1 text-[11px] text-[#8a8a84]">
              {TREND_ICON[progress.recentTrend]}
              {TREND_LABEL[progress.recentTrend]}
            </span>
          )}
        </div>

        {/* Weekly progress bar */}
        <WeeklyBar done={progress.sessionsThisWeek} target={progress.weeklyTarget} />
      </div>

      {/* ── Overview cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#fafaf8] dark:bg-[#1e1e1c] border border-[#e2e2de] dark:border-[#2e2e2b] rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-[#1a1a18] dark:text-[#f0f0ee]">{progress.totalSessions}</p>
          <p className="text-xs text-[#8a8a84] mt-0.5">Sessions</p>
        </div>
        <div className="bg-[#fafaf8] dark:bg-[#1e1e1c] border border-[#e2e2de] dark:border-[#2e2e2b] rounded-2xl p-4 text-center">
          <p className={`text-2xl font-bold ${scoreTextColor(avgPct)}`}>{progress.avgScore.toFixed(1)}</p>
          <p className="text-xs text-[#8a8a84] mt-0.5">Avg Score</p>
        </div>
        <div className="bg-[#fafaf8] dark:bg-[#1e1e1c] border border-[#e2e2de] dark:border-[#2e2e2b] rounded-2xl p-4 text-center">
          <p className={`text-2xl font-bold ${scoreTextColor(bestPct)}`}>{progress.bestScore}</p>
          <p className="text-xs text-[#8a8a84] mt-0.5">Best Score</p>
        </div>
      </div>

      {/* ── Trend chart ── */}
      <div className="bg-[#fafaf8] dark:bg-[#1e1e1c] border border-[#e2e2de] dark:border-[#2e2e2b] rounded-2xl p-4">
        <TrendChart sessions={sessions} />
      </div>

      {/* ── Skill breakdown ── */}
      <div className="bg-[#fafaf8] dark:bg-[#1e1e1c] border border-[#e2e2de] dark:border-[#2e2e2b] rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[#6b6b65] dark:text-[#8a8a84] uppercase tracking-wide flex items-center gap-1.5 mb-1">
          <Target size={12} /> Skill Breakdown (last 10 sessions avg)
        </h3>
        <SkillBar
          label="Objection Handling"
          value={Math.round(progress.avgOH * 10) / 10}
          max={SCORE_MAX.objectionHandling}
        />
        <SkillBar label="Questioning" value={Math.round(progress.avgQ * 10) / 10} max={SCORE_MAX.questioning} />
        <SkillBar label="Closing" value={Math.round(progress.avgC * 10) / 10} max={SCORE_MAX.closing} />
        {/* Weakest skill callout */}
        {progress.weakestSkill && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 pt-1">
            <AlertCircle size={10} /> Weakest skill: {progress.weakestSkillLabel} — see recommendations below
          </p>
        )}
      </div>

      {/* ── Recommendations ── */}
      <div>
        <h3 className="text-xs font-semibold text-[#6b6b65] dark:text-[#8a8a84] uppercase tracking-wide flex items-center gap-1.5 mb-2">
          <AlertCircle size={12} /> Areas to Improve
        </h3>
        <WeaknessPanel sessions={sessions} />
      </div>

      {/* ── Unlock status ── */}
      {!progress.hardUnlocked && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#fafaf8] dark:bg-[#1e1e1c] border border-[#e2e2de] dark:border-[#2e2e2b] text-xs text-[#8a8a84]">
          <Zap size={13} className="text-amber-500 flex-shrink-0" />
          <span>
            <strong className="text-[#3d3d39] dark:text-[#c8c8c2]">Hard mode</strong> unlocks after 5 sessions or an
            average score of 28+. You have {progress.totalSessions} session{progress.totalSessions !== 1 ? "s" : ""}.
          </span>
        </div>
      )}

      {/* ── Session history ── */}
      <div>
        <h3 className="text-xs font-semibold text-[#6b6b65] dark:text-[#8a8a84] uppercase tracking-wide flex items-center gap-1.5 mb-2">
          <Clock size={12} /> Recent Sessions
        </h3>
        <div className="space-y-1">
          {sessions.slice(0, 20).map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onView={setSelectedSession}
              replayEnabled={appConfig.featureFlags.enableReplay}
            />
          ))}
          {sessions.length > 20 && (
            <p className="text-center text-xs text-[#8a8a84] py-2">Showing 20 of {sessions.length} sessions</p>
          )}
        </div>
      </div>

      {isAdmin && targetRepId !== null && (
        <p className="text-center text-xs text-[#8a8a84] pt-2">
          Viewing your own stats. Switch to the Admin panel to view individual rep progress.
        </p>
      )}

      {/* ── Session Replay Modal ── */}
      {selectedSession && <RoleplayReplay session={selectedSession} onClose={() => setSelectedSession(null)} />}
    </div>
  );
}

export default RoleplayDashboard;
