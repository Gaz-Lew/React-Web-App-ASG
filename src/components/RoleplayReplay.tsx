/**
 * RoleplayReplay.tsx — Session replay viewer
 *
 * Displays a recorded roleplay session as a chat-style transcript.
 * Supports:
 *  - Static view (all messages visible immediately)
 *  - Animated replay mode (reveals messages one-by-one with delay)
 *  - Section score breakdown (if session has sectionScores)
 *  - Structured feedback display (strengths / improvements / missed opportunities)
 *  - Fallback to plain-text feedback for older sessions
 *  - Talk time and duration metrics
 *
 * Compatible with both v1 messages (role/text) and v3 messages (sender/content).
 */

import { useState, useEffect, useRef } from "react";
import type { RoleplaySession, SessionMessage } from "../types";
import {
  X,
  Play,
  Pause,
  SkipForward,
  Clock,
  Award,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  Mic,
  TrendingUp,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants + helpers
// ─────────────────────────────────────────────────────────────────────────────

const SCENARIO_LABELS: Record<string, string> = {
  booking_call:  "Booking Call",
  door_knock:    "Door Knock",
  first_consult: "First Consult",
  follow_up:     "Follow Up",
  property_sale: "Property Sale",
};

const SECTION_LABELS: Record<string, string> = {
  opening:       "Opening",
  rapport:       "Rapport",
  qualification: "Qualification",
  valueDelivery: "Value Delivery",
  closing:       "Closing",
};

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function scoreColor(pct: number): string {
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function barColor(pct: number): string {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-red-500";
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalise message format
// ─────────────────────────────────────────────────────────────────────────────

interface NormalMessage {
  key: string;
  sender: "rep" | "ai";
  content: string;
  timestamp: number;
}

function normaliseMessages(session: RoleplaySession): NormalMessage[] {
  const raw = (session.messages ?? []) as (SessionMessage & { role?: string; text?: string })[];

  return raw
    .filter((m) => {
      // Filter out system messages regardless of format
      const role = m.sender === undefined ? m.role : undefined;
      return role !== "system" && m.sender !== undefined || (m.role !== "system");
    })
    .map((m, i) => {
      // Determine sender — support both v1 (role) and v3 (sender)
      let sender: "rep" | "ai";
      if (m.sender) {
        sender = m.sender;
      } else {
        sender = m.role === "user" ? "rep" : "ai";
      }

      // Determine content — support both v1 (text) and v3 (content)
      const content = (m.content ?? m.text ?? "").trim();

      return {
        key: `msg-${i}`,
        sender,
        content,
        timestamp: m.timestamp ?? (session.startedAt ?? session.completedAt ?? 0),
      };
    })
    .filter((m) => m.content.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Single message bubble */
function MessageBubble({ msg, showTimestamp }: { msg: NormalMessage; showTimestamp: boolean }) {
  const isRep = msg.sender === "rep";
  return (
    <div className={`flex ${isRep ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[82%] space-y-0.5">
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isRep
              ? "bg-purple-500 text-white rounded-br-sm"
              : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm"
          }`}
        >
          {msg.content}
        </div>
        {showTimestamp && msg.timestamp > 0 && (
          <p className={`text-[9px] text-gray-400 px-1 ${isRep ? "text-right" : "text-left"}`}>
            {isRep ? "You" : "AI Client"} · {fmtTimestamp(msg.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}

/** Animated "AI is typing" dots */
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}

/** Section score bar */
function SectionBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 10) * 100);
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400">{label}</span>
        <span className={`text-[11px] font-bold tabular-nums ${scoreColor(pct)}`}>
          {value}/10
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  session: RoleplaySession;
  onClose: () => void;
}

export function RoleplayReplay({ session, onClose }: Props) {
  const messages = normaliseMessages(session);

  // Replay state
  const [visibleCount, setVisibleCount] = useState(messages.length); // default: show all
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [showTimestamps, setShowTimestamps] = useState(false);

  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new messages appear
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleCount]);

  // Replay ticker
  useEffect(() => {
    if (!isReplaying) return;

    if (replayIndex >= messages.length) {
      setIsReplaying(false);
      setVisibleCount(messages.length);
      return;
    }

    // Vary delay based on sender: AI messages get a slightly longer pause
    const baseDelay = messages[replayIndex]?.sender === "ai" ? 700 : 500;
    const delay = baseDelay + Math.random() * 500;

    replayTimerRef.current = setTimeout(() => {
      setVisibleCount(replayIndex + 1);
      setReplayIndex((i) => i + 1);
    }, delay);

    return () => {
      if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    };
  }, [isReplaying, replayIndex, messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    };
  }, []);

  // Controls
  const startReplay = () => {
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    setVisibleCount(0);
    setReplayIndex(0);
    setIsReplaying(true);
  };

  const pauseReplay = () => {
    setIsReplaying(false);
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
  };

  const skipToEnd = () => {
    pauseReplay();
    setVisibleCount(messages.length);
  };

  // Derived values
  const score = session.score;
  const totalScore = score?.total ?? 0;
  const totalPct = Math.round((totalScore / 40) * 100);
  const sectionScores = session.sectionScores;
  const structuredFeedback = session.structuredFeedback;
  const duration = session.durationSeconds;
  const talkRep = session.talkTimeRepPercent;
  const sessionDate = session.completedAt ?? session.endedAt ?? 0;

  // Keyboard close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1a1a18] w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[96dvh] sm:max-h-[88vh] overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <MessageSquare size={14} className="text-purple-500 flex-shrink-0" />
              Session Replay
              {session.partial && (
                <span className="text-[10px] font-normal text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-700/40 ml-1">
                  partial
                </span>
              )}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
              {SCENARIO_LABELS[session.scenarioType] ?? session.scenarioType}
              {session.personaType
                ? ` · ${session.personaType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`
                : ""}
              {session.difficulty ? ` · ${session.difficulty}` : ""}
              {" · "}
              {fmtDate(sessionDate)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition flex-shrink-0"
            aria-label="Close replay"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Stats bar ── */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 px-4 py-2 border-b border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.015] flex-shrink-0">
          {/* Overall score */}
          {score && (
            <div className="flex items-center gap-1.5 text-xs">
              <Award size={12} className="text-amber-500 flex-shrink-0" />
              <span className={`font-bold tabular-nums ${scoreColor(totalPct)}`}>
                {totalScore}/40
              </span>
              <span className="text-gray-400">({totalPct}%)</span>
            </div>
          )}

          {/* Duration */}
          {duration != null && duration > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <Clock size={11} className="text-blue-500 flex-shrink-0" />
              {fmtDuration(duration)}
            </div>
          )}

          {/* Talk time */}
          {talkRep != null && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Mic size={11} className="flex-shrink-0" />
              Rep {Math.round(talkRep)}% · AI {Math.round(100 - talkRep)}%
            </div>
          )}

          {/* Script badge */}
          {session.scriptId && (
            <div className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 rounded-full">
              Script used
            </div>
          )}

          {/* Replay controls */}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setShowTimestamps((p) => !p)}
              className={`text-[10px] px-2 py-1 rounded-md border transition ${
                showTimestamps
                  ? "border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20"
                  : "border-gray-200 dark:border-white/[0.08] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              Times
            </button>

            {isReplaying ? (
              <>
                <button
                  onClick={pauseReplay}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  <Pause size={11} /> Pause
                </button>
                <button
                  onClick={skipToEnd}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  <SkipForward size={11} /> End
                </button>
              </>
            ) : (
              <button
                onClick={startReplay}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500 text-xs font-semibold text-white hover:bg-purple-400 transition"
              >
                <Play size={11} /> Replay
              </button>
            )}
          </div>
        </div>

        {/* ── Message transcript ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare size={28} className="text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-sm text-gray-400">No transcript available for this session.</p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                Sessions recorded before v3 may not include message data.
              </p>
            </div>
          ) : (
            <>
              {messages.slice(0, visibleCount).map((msg) => (
                <MessageBubble key={msg.key} msg={msg} showTimestamp={showTimestamps} />
              ))}

              {/* Typing indicator while replaying */}
              {isReplaying && replayIndex < messages.length && messages[replayIndex]?.sender === "ai" && (
                <TypingIndicator />
              )}

              {/* Replay progress */}
              {isReplaying && (
                <div className="flex items-center gap-2 py-1 px-2">
                  <div className="flex-1 h-0.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-400 rounded-full transition-all duration-300"
                      style={{ width: `${(visibleCount / messages.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    {visibleCount}/{messages.length}
                  </span>
                </div>
              )}

              <div ref={scrollAnchorRef} />
            </>
          )}
        </div>

        {/* ── Score breakdown + feedback panel ── */}
        {(sectionScores || structuredFeedback || session.feedback || score) && (
          <div className="border-t border-gray-100 dark:border-white/[0.06] flex-shrink-0 max-h-64 overflow-y-auto">

            {/* Section scores */}
            {sectionScores && (
              <div className="px-4 pt-3 pb-2 space-y-2">
                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <TrendingUp size={10} /> Score Breakdown
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {Object.entries(sectionScores).map(([key, val]) => (
                    <SectionBar
                      key={key}
                      label={SECTION_LABELS[key] ?? key}
                      value={val as number}
                    />
                  ))}
                </div>
                {/* Overall */}
                {score && (
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-white/[0.06] mt-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Overall</span>
                    <span className={`text-sm font-bold tabular-nums ${scoreColor(totalPct)}`}>
                      {totalScore}/40 ({totalPct}%)
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Structured feedback */}
            {structuredFeedback && (
              <div className="px-4 pb-3 pt-2 space-y-2.5 border-t border-gray-100 dark:border-white/[0.06]">
                {structuredFeedback.strengths.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-1 mb-1.5">
                      <CheckCircle size={10} /> Strengths
                    </h4>
                    <ul className="space-y-0.5">
                      {structuredFeedback.strengths.map((s, i) => (
                        <li key={i} className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                          • {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {structuredFeedback.improvements.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1.5">
                      <AlertCircle size={10} /> Improvements
                    </h4>
                    <ul className="space-y-0.5">
                      {structuredFeedback.improvements.map((s, i) => (
                        <li key={i} className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                          • {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {structuredFeedback.missedOpportunities.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-semibold text-red-600 dark:text-red-400 flex items-center gap-1 mb-1.5">
                      ⚡ Missed Opportunities
                    </h4>
                    <ul className="space-y-0.5">
                      {structuredFeedback.missedOpportunities.map((s, i) => (
                        <li key={i} className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                          • {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Fallback: plain-text feedback (v1/v2 sessions) */}
            {!structuredFeedback && session.feedback && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-white/[0.06]">
                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Feedback
                </h3>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">
                  {session.feedback}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RoleplayReplay;
