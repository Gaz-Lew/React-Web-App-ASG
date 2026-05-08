/**
 * FloatingCalculator.tsx — Floating draggable calculator system.
 *
 * A circular button sits in the bottom-right corner. Click to open
 * a full calculator panel. Position and panel size persist in localStorage.
 *
 * Mount once in App.tsx for global availability.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { CalculatorPanel } from "./CalculatorPanel";
import { Calculator } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

const POS_KEY = "asg-calculator-position";
const SIZE_KEY = "asg-calculator-size";
const SIZE_MODE_KEY = "calc_size_mode";
const THEME_KEY = "calc_theme";

const DEFAULT_PANEL_W = 300;
const DEFAULT_PANEL_H = 460;
const LARGE_PANEL_W = 420;
const LARGE_PANEL_H = 520;

const MARGIN = 4;

interface StoredPos {
  right: number;
  bottom: number;
}

interface StoredSize {
  w: number;
  h: number;
}

type SizeMode = "normal" | "large";
type Theme = "dark" | "light";

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

function loadSize(): StoredSize {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as StoredSize;
      if (s.w >= 260 && s.h >= 320) return s;
    }
  } catch {
    /* ignore */
  }
  return { w: DEFAULT_PANEL_W, h: DEFAULT_PANEL_H };
}

function saveSize(w: number, h: number) {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify({ w, h }));
  } catch {
    /* ignore */
  }
}

function loadSizeMode(): SizeMode {
  try {
    const raw = localStorage.getItem(SIZE_MODE_KEY);
    if (raw === "large" || raw === "normal") return raw;
  } catch {
    /* ignore */
  }
  return "normal";
}

function saveSizeMode(mode: SizeMode) {
  try {
    localStorage.setItem(SIZE_MODE_KEY, mode);
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
// Button size
// ─────────────────────────────────────────────────────────────────────────────

const BTN_SIZE = 48;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function FloatingCalculator() {
  const [isOpen, setIsOpen] = useState(false);

  // Position (distance from right and bottom edges)
  const savedPos = useRef<StoredPos | null>(loadPos());
  const [offset, setOffset] = useState({ right: 24, bottom: 24 });

  // Size mode
  const savedSizeMode = useRef<SizeMode>(loadSizeMode());
  const [sizeMode, setSizeMode] = useState<SizeMode>(savedSizeMode.current);

  // Panel size (derived from sizeMode, but overridden by manual resize)
  const savedSize = useRef<StoredSize>(loadSize());
  const [panelSize, setPanelSize] = useState({
    w: savedSize.current.w,
    h: savedSize.current.h,
  });

  // Theme
  const savedTheme = useRef<Theme>(loadTheme());
  const [theme, setTheme] = useState<Theme>(savedTheme.current);

  // Scale (pinch-to-resize) and position (drag handle offset)
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Drag state
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ clientX: 0, clientY: 0, right: 0, bottom: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // ── Clamp offset so button stays fully within viewport ────────────────

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

  // Sync panel size when sizeMode toggles (unless user manually resized to non-default)
  const applySizeMode = useCallback((mode: SizeMode) => {
    const targetW = mode === "large" ? LARGE_PANEL_W : DEFAULT_PANEL_W;
    const targetH = mode === "large" ? LARGE_PANEL_H : DEFAULT_PANEL_H;
    setPanelSize({ w: targetW, h: targetH });
    saveSize(targetW, targetH);
  }, []);

  const handleToggleSizeMode = useCallback(() => {
    setSizeMode((prev) => {
      const next = prev === "normal" ? "large" : "normal";
      saveSizeMode(next);
      applySizeMode(next);
      return next;
    });
  }, [applySizeMode]);

  // ── Theme toggle ──────────────────────────────────────────────────────

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
      try {
        btnRef.current?.setPointerCapture(e.pointerId);
      } catch (err) {
        console.warn("[FloatingCalculator] setPointerCapture failed", err);
      }
    },
    [offset],
  );

  // Global pointer move/up for dragging
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
      // mic button in AIRoleplay) would trigger both calculator AND calendar
      // to toggle simultaneously.
      if (!btnRef.current?.hasPointerCapture(e.pointerId)) return;

      document.body.style.userSelect = "";

      if (draggingRef.current) {
        savePos(offset.right, offset.bottom);
        draggingRef.current = false;
      } else {
        setIsOpen((prev) => !prev);
      }
      try {
        btnRef.current?.releasePointerCapture(e.pointerId);
      } catch (err) {
        console.warn("[FloatingCalculator] releasePointerCapture failed", err);
      }
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

  // Wheel-to-resize — scroll over panel to scale it
  const handlePanelWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(1.4, Math.max(0.7, s - e.deltaY * 0.001)));
  }, []);

  // Stable resize callback for panel to notify on size change
  const handlePanelResize = useCallback((w: number, h: number) => {
    setPanelSize({ w, h });
    saveSize(w, h);
  }, []);

  // ── Clamp panel position on every render ──────────────────────────────

  const panelRight = offset.right;
  const panelBottom = offset.bottom + BTN_SIZE + 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const clampedPanelRight = Math.max(MARGIN, Math.min(vw - panelSize.w - MARGIN, panelRight));
  const clampedPanelBottom = Math.max(MARGIN, Math.min(vh - panelSize.h - MARGIN, panelBottom));

  return (
    <>
      {/* Floating button */}
      <button
        ref={btnRef}
        onPointerDown={handlePointerDown}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[9999] rounded-full flex items-center justify-center transition-shadow cursor-grab active:cursor-grabbing"
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
        title="Open calculator"
      >
        <Calculator size={20} style={{ color: "#b8933a", transition: "opacity 0.15s" }} />
      </button>

      {/* Calculator panel — clamped to viewport */}
      {isOpen && (
        <div
          data-calculator-panel
          className="fixed z-[9999]"
          onClick={(e) => e.stopPropagation()}
          onWheel={handlePanelWheel}
          style={{
            right: clampedPanelRight,
            bottom: clampedPanelBottom,
            width: panelSize.w,
            height: panelSize.h,
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "bottom right",
            transition: "width 0.2s ease, height 0.2s ease",
            pointerEvents: "auto",
          }}
        >
          <CalculatorPanel
            onClose={() => setIsOpen(false)}
            initialWidth={panelSize.w}
            initialHeight={panelSize.h}
            onResize={handlePanelResize}
            sizeMode={sizeMode}
            theme={theme}
            onToggleSizeMode={handleToggleSizeMode}
            onToggleTheme={handleToggleTheme}
          />
          {/* Drag handle — moves panel via position offset */}
          <div
            className="absolute bottom-2 right-2 w-4 h-4 rounded-full cursor-grab active:cursor-grabbing opacity-70 hover:opacity-100 bg-[var(--border)]"
            style={{ zIndex: 10000, touchAction: "none" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const handle = e.currentTarget as HTMLElement;
              try {
                handle.setPointerCapture(e.pointerId);
              } catch (err) {
                console.warn("[FloatingCalculator] panel handle setPointerCapture failed", err);
              }
              const startX = e.clientX;
              const startY = e.clientY;
              const startPos = { x: position.x, y: position.y };

              const move = (ev: PointerEvent) => {
                if (!handle.hasPointerCapture(ev.pointerId)) return;
                setPosition({
                  x: startPos.x + (ev.clientX - startX),
                  y: startPos.y + (ev.clientY - startY),
                });
              };

              const up = (ev: PointerEvent) => {
                if (!handle.hasPointerCapture(ev.pointerId)) return;
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                try {
                  handle.releasePointerCapture(ev.pointerId);
                } catch (err) {
                  console.warn("[FloatingCalculator] panel handle releasePointerCapture failed", err);
                }
              };

              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          />
        </div>
      )}
    </>
  );
}

export default FloatingCalculator;
