import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, X, Copy, Check, ChevronDown, ChevronUp, Play, Square } from "lucide-react";

/* ── Public interface ────────────────────────────────────────────────────────── */
export interface AIGuidanceCardProps {
  suggestion: string;
  actionType?: "call" | "followup" | "book" | null;
  script?: string;
  /** Optional objection type when one is detected */
  objection?: "risk" | "price" | "trust" | "timing" | undefined;
  /** Optional coaching message */
  coaching?: string | undefined;
  /** Optional: shown when profile data supports the suggestion ("Based on your recent success with…") */
  confidenceHint?: string;
  onDismiss: () => void;
  /** Optional: called when rep clicks "Use Script" — e.g. populate a note field */
  onUseScript?: (script: string) => void;
}

/* ── Component ───────────────────────────────────────────────────────────────── */
export function AIGuidanceCard({
  suggestion,
  actionType,
  script,
  objection,
  coaching,
  confidenceHint,
  onDismiss,
  onUseScript,
}: AIGuidanceCardProps) {
  const [scriptOpen, setScriptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const pulseTimeout = useRef<number | null>(null);
  const canUseSpeech =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined";

  const speak = useCallback((text: string) => {
    if (!canUseSpeech) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      setIsPlaying(true);
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("[AIGuidanceCard] speak failed", err);
      setIsPlaying(false);
    }
  }, [canUseSpeech, rate, pitch]);

  const stopSpeech = useCallback(() => {
    if (!canUseSpeech) return;
    try {
      window.speechSynthesis.cancel();
    } catch (err) {
      console.warn("[AIGuidanceCard] stop speech failed", err);
    }
    setIsPlaying(false);
  }, [canUseSpeech]);

  useEffect(
    () => () => {
      if (!canUseSpeech) return;
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        console.warn("[AIGuidanceCard] cleanup speech cancel failed", err);
      }
    },
    [canUseSpeech],
  );

  /* ── Helper: compute priority badge info ─────────────────────────────────── */
  const computePriority = () => {
    // HIGH: objection confidence > 0.7 OR coaching active
    // MEDIUM: objection exists
    // LOW: everything else
    let priority = "low";
    let bgColor = "bg-gray-500/20";
    let color = "text-gray-400";

    if (objection) {
      const confidence = (objection as any).confidence ?? 0;
      if (confidence > 0.7) priority = "high";
      else priority = "medium";
    } else if (coaching) {
      priority = "medium";
    }

    const confidence = objection ? ((objection as any).confidence ?? 0) : 0;
    const opacity = priority === "high" ? 1 : 0.4 + confidence * 0.6;

    const bgMap = {
      high: "bg-red-500/20",
      medium: "bg-[#b8933a]/20",
      low: "bg-gray-500/20",
    };

    return { priority, bg: opacity > 0 ? opacity : undefined, color: priority === "high" ? "text-red-400" : undefined };
  };

  /* ── Auto‑expand / attention trigger ───────────────────────────────────── */
  useEffect(() => {
    // Pulse when objection changes or coaching becomes active
    if (objection || coaching) {
      setIsPulsing(true);
      if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
      pulseTimeout.current = window.setTimeout(() => setIsPulsing(false), 2000);
    }
    // Reset pulse when both disappear
    if (!objection && !coaching) {
      setIsPulsing(false);
    }
    return () => {
      if (pulseTimeout.current) clearTimeout(pulseTimeout.current);
    };
  }, [objection, coaching]);

  /* ── Use‑script UX ─────────────────────────────────────────────────────── */
  const handleUseScript = () => {
    if (onUseScript && script) {
      try {
        onUseScript(script);
        // Insert script into notes (assumes a textarea with class "notes-tab" exists in the parent)
        const textarea = document.querySelector("textarea.notes-tab") as HTMLTextAreaElement | null;
        if (textarea) {
          textarea.focus();
          textarea.value = script;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          textarea.scrollIntoView({ behavior: "smooth" });
          // Temporary highlight ring
          const ring = document.createElement("div");
          ring.className = "ring-2 ring-[#b8933a] absolute rounded-md w-full h-full";
          ring.style.top = "0";
          ring.style.left = "0";
          ring.style.pointerEvents = "none";
          textarea.parentElement?.appendChild(ring);
          setTimeout(() => ring.remove(), 1500);
        }
      } catch (err) {
        console.warn("[AIGuidanceCard] use-script action failed", err);
      }
    }
  };

  /* ── Helper: copy script ─────────────────────────────────────────────── */
  const handleCopy = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — silently ignore
    }
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-150"
      role="complementary"
      aria-label="AI guidance"
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: "rgba(184,147,58,0.10)" }}
        >
          <Sparkles size={14} style={{ color: "#b8933a" }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Label */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">AI Guidance</p>

          {/* Context line */}
          {objection && (
            <p className="text-[11px] text-gray-400 mb-1">
              Client showing {objection} resistance
            </p>
          )}
          {coaching && !objection && (
            <p className="text-[11px] text-gray-400 mb-1">
              {coaching}
            </p>
          )}

          {/* Next best action label */}
          <p className="text-xs font-medium text-[#b8933a] mb-1">
            Next best action
          </p>

          {/* Suggestion */}
          <p className="text-xs text-gray-300 leading-relaxed mb-2">{suggestion}</p>

          {/* Confidence hint — only present when profile data backs the suggestion */}
          {confidenceHint && (
            <p className="text-[10px] text-gray-500 italic -mt-1 mb-2">{confidenceHint}</p>
          )}

          {/* Objection badge */}
          {objection && (
            <p className="text-[10px] font-medium uppercase tracking-wider bg-gray-200/30 text-gray-600 rounded px-2 py-1 mb-1">
              Objection detected: {objection}
            </p>
          )}

          {/* Script section */}
          {script && (
            <div className="mt-3">
              <button
                onClick={() => setScriptOpen((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-amber-500 hover:text-amber-400 transition-colors duration-100"
              >
                {scriptOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {scriptOpen ? "Hide suggested script" : "View suggested script"}
              </button>

              {scriptOpen && (
                <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                  <p className="text-xs text-gray-400 italic leading-relaxed whitespace-pre-wrap">{script}</p>

                  {/* TTS sliders */}
                  <div className="flex items-center gap-4 mt-2.5 pt-2 border-t border-[var(--border)]">
                    <label className="flex items-center gap-1.5 text-[10px] text-gray-500 whitespace-nowrap">
                      Speed
                      <input
                        type="range" min={0.5} max={2} step={0.1}
                        value={rate}
                        onChange={(e) => setRate(Number(e.target.value))}
                        className="w-16 accent-amber-500"
                      />
                      <span className="w-6 text-right tabular-nums">{rate.toFixed(1)}</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] text-gray-500 whitespace-nowrap">
                      Pitch
                      <input
                        type="range" min={0.5} max={2} step={0.1}
                        value={pitch}
                        onChange={(e) => setPitch(Number(e.target.value))}
                        className="w-16 accent-amber-500"
                      />
                      <span className="w-6 text-right tabular-nums">{pitch.toFixed(1)}</span>
                    </label>
                  </div>

                  {/* Script actions */}
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[var(--border)]">
                    <button
                      onClick={() => isPlaying ? stopSpeech() : speak(script)}
                      className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 hover:text-gray-300 transition-colors duration-100"
                    >
                      {isPlaying ? <Square size={10} className="text-amber-500" /> : <Play size={10} />}
                      {isPlaying ? "Stop" : "Play"}
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 hover:text-gray-300 transition-colors duration-100"
                    >
                      {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    {onUseScript && (
                      <button
                        onClick={handleUseScript}
                        className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md transition-all duration-150 active:scale-[0.97]"
                        style={{ background: "rgba(184,147,58,0.12)", color: "#b8933a" }}
                      >
                        Use Script
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Coaching message */}
          {coaching && <p className="text-[10px] text-gray-400 mt-1">{coaching}</p>}

          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-[var(--hover)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-100 flex-shrink-0 -mt-0.5 -mr-0.5"
            title="Dismiss guidance"
            aria-label="Dismiss AI guidance"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
