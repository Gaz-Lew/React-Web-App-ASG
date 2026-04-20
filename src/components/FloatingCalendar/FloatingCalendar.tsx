/**
 * FloatingCalendar.tsx — Floating draggable calendar tool.
 *
 * A circular button sits independently of the calculator. Click to open
 * a month-view calendar panel. Position persists in localStorage.
 *
 * Mount once in App.tsx for global availability.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { CalendarPanel } from "./CalendarPanel";
import { Calendar as CalIcon } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

const POS_KEY = "asg-calendar-position";
const THEME_KEY = "cal_theme";

const MARGIN = 4;
const BTN_SIZE = 48;

type Theme = "dark" | "light";

interface StoredPos {
  right: number;
  bottom: number;
}

function loadPos(): StoredPos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return JSON.parse(raw) as StoredPos;
  } catch {
    /* ignore */
  }
  return null;
}

function savePos(right: number, bottom: number) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ right, bottom }));
  } catch {
    /* ignore */
  }
}

function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    /* ignore */
  }
  return "dark";
}

function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function FloatingCalendar() {
  const [isOpen, setIsOpen] = useState(false);

  // Position — offset from calculator (default left of calculator button)
  const savedPos = useRef<StoredPos | null>(loadPos());
  const [offset, setOffset] = useState({ right: 84, bottom: 24 });

  // Theme
  const savedTheme = useRef<Theme>(loadTheme());
  const [theme, setTheme] = useState<Theme>(savedTheme.current);

  // Drag state
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ clientX: 0, clientY: 0, right: 0, bottom: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // ── Clamp offset ────────────────────────────────────────────────────────

  const clampOffset = useCallback((right: number, bottom: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      right: Math.max(MARGIN, Math.min(vw - BTN_SIZE - MARGIN, right)),
      bottom: Math.max(MARGIN, Math.min(vh - BTN_SIZE - MARGIN, bottom)),
    };
  }, []);

  // Initialize position on first mount (clamped)
  useEffect(() => {
    if (savedPos.current) {
      setOffset(clampOffset(savedPos.current.right, savedPos.current.bottom));
    }
  }, [clampOffset]);

  // ── Theme toggle ────────────────────────────────────────────────────────

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      saveTheme(next);
      return next;
    });
  }, []);

  // ── Drag handlers ──────────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = false;
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        right: offset.right,
        bottom: offset.bottom,
      };
      btnRef.current?.setPointerCapture(e.pointerId);
    },
    [offset],
  );

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      // Only process events where this button has captured the pointer
      if (!btnRef.current?.hasPointerCapture(e.pointerId)) return;

      const dx = dragStartRef.current.clientX - e.clientX;
      const dy = dragStartRef.current.clientY - e.clientY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        draggingRef.current = true;
        document.body.style.userSelect = "none";
      }

      if (draggingRef.current) {
        const clamped = clampOffset(dragStartRef.current.right + dx, dragStartRef.current.bottom + dy);
        setOffset(clamped);
      }
    };

    const handleUp = (e: PointerEvent) => {
      // CRITICAL: only act if THIS button captured the pointer.
      // Without this guard, releasing a click anywhere on the page (e.g. the
      // mic button in AIRoleplay, or a lead row) would trigger both calendar
      // AND calculator to toggle simultaneously.
      if (!btnRef.current?.hasPointerCapture(e.pointerId)) return;

      document.body.style.userSelect = "";

      if (draggingRef.current) {
        savePos(offset.right, offset.bottom);
        draggingRef.current = false;
      } else {
        setIsOpen((prev) => !prev);
      }
      btnRef.current?.releasePointerCapture(e.pointerId);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.userSelect = "";
    };
  }, [offset, clampOffset]);

  // Save position when panel closes
  useEffect(() => {
    if (!isOpen) {
      savePos(offset.right, offset.bottom);
    }
  }, [isOpen, offset]);

  // ── Clamp panel position on every render ──────────────────────────────

  const PANEL_W = 320;
  const PANEL_H = 440;

  const panelRight = offset.right;
  const panelBottom = offset.bottom + BTN_SIZE + 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const clampedPanelRight = Math.max(MARGIN, Math.min(vw - PANEL_W - MARGIN, panelRight));
  const clampedPanelBottom = Math.max(MARGIN, Math.min(vh - PANEL_H - MARGIN, panelBottom));

  return (
    <>
      {/* Floating button */}
      <button
        ref={btnRef}
        onPointerDown={handlePointerDown}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[9998] rounded-full flex items-center justify-center transition-shadow cursor-grab active:cursor-grabbing"
        style={{
          right: offset.right,
          bottom: offset.bottom,
          width: BTN_SIZE,
          height: BTN_SIZE,
          background: "#1A1A1D",
          border: "1px solid #b8933a",
          opacity: isOpen ? 0.85 : 0.4,
          boxShadow: isOpen ? "0 0 12px rgba(184,147,58,0.2)" : "0 2px 8px rgba(0,0,0,0.3)",
        }}
        title="Open calendar"
      >
        <CalIcon size={20} style={{ color: "#b8933a", transition: "opacity 0.15s" }} />
      </button>

      {/* Calendar panel — clamped to viewport */}
      {isOpen && (
        <div
          data-calendar-wrapper
          className="fixed z-[9997]"
          onClick={(e) => e.stopPropagation()}
          style={{
            right: clampedPanelRight,
            bottom: clampedPanelBottom,
            pointerEvents: "auto",
          }}
        >
          <CalendarPanel onClose={() => setIsOpen(false)} theme={theme} onToggleTheme={handleToggleTheme} />
        </div>
      )}
    </>
  );
}

export default FloatingCalendar;
