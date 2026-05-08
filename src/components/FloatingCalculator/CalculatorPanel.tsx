/**
 * CalculatorPanel.tsx — Full calculator logic with display, history, keyboard, and resize.
 *
 * Supports independent dark/light theme and quick resize toggle.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { X, GripVertical, Copy, Check, Maximize2, Minimize2, Moon, Sun } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  expression: string;
  result: string;
}

type SizeMode = "normal" | "large";
type Theme = "dark" | "light";

interface CalculatorPanelProps {
  onClose: () => void;
  initialWidth: number;
  initialHeight: number;
  onResize?: (width: number, height: number) => void;
  sizeMode: SizeMode;
  theme: Theme;
  onToggleSizeMode: () => void;
  onToggleTheme: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "asg-calculator-history";

const NUMBER_FORMAT = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 2,
});

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as HistoryEntry[];
  } catch {
    /* corrupt — ignore */
  }
  return [];
}

function saveHistory(history: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-3)));
  } catch {
    /* storage full — ignore */
  }
}

/**
 * Format a raw numeric string for display.
 */
function formatDisplay(value: string): string {
  if (value === "Error" || value === "0" || !value) return value;
  if (/[+\-*/.(]$/.test(value)) return value;

  const num = Number(value);
  if (!isFinite(num)) return value;

  return NUMBER_FORMAT.format(num);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  return String(Math.round(value * 1e12) / 1e12);
}

function normalizeNumericString(value: string): string | null {
  if (value === "Error") return null;

  const trimmed = value.trim();
  if (!trimmed) return "0";

  const sign = trimmed.startsWith("-") ? "-" : "";
  let body = sign ? trimmed.slice(1) : trimmed;

  if (body === ".") body = "0.";
  if (body.startsWith(".")) body = `0${body}`;
  if (!/^\d+(\.\d*)?$/.test(body)) return null;

  const hasDecimal = body.includes(".");
  const [rawInteger, fraction = ""] = body.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/, "") || "0";
  const normalized = `${sign}${integer}${hasDecimal ? `.${fraction}` : ""}`;

  return Number.isFinite(Number(normalized)) ? normalized : null;
}

function parseCalculatorValue(value: string): number | null {
  const normalized = normalizeNumericString(value);
  if (normalized === null) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function appendDigitValue(value: string, digit: string): string {
  const normalized = normalizeNumericString(value) ?? "0";

  if (digit === ".") {
    return normalized.includes(".") ? normalized : `${normalized}.`;
  }

  if (normalized === "0") return digit === "0" ? "0" : digit;
  if (normalized === "-0") return digit === "0" ? "-0" : `-${digit}`;

  return normalizeNumericString(`${normalized}${digit}`) ?? normalized;
}

function calculate(first: number, second: number, operator: string): string {
  switch (operator) {
    case "+":
      return formatNumber(first + second);
    case "-":
      return formatNumber(first - second);
    case "*":
      return formatNumber(first * second);
    case "/":
      return second === 0 ? "Error" : formatNumber(first / second);
    default:
      return formatNumber(second);
  }
}

function displayExpression(first: number, operator: string, second?: string): string {
  return `${formatNumber(first)}${operator}${second ?? ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme definitions
// ─────────────────────────────────────────────────────────────────────────────

const THEMES: Record<
  Theme,
  {
    panelBg: string;
    panelBorder: string;
    headerBg: string;
    headerBorder: string;
    displayColor: string;
    historyColor: string;
    historyEmptyColor: string;
    historyIconColor: string;
    btnDefault: string;
    btnDefaultHover: string;
    btnDefaultText: string;
    btnOp: string;
    btnOpHover: string;
    btnOpText: string;
    btnEquals: string;
    btnEqualsHover: string;
    btnAccent: string;
    btnAccentHover: string;
    btnAccentText: string;
    dividerColor: string;
    copyBtnDefault: string;
    copyBtnHover: string;
    copyBtnActive: string;
    copiedBg: string;
    closeBtnDefault: string;
    closeBtnHover: string;
    closeBtnHoverBg: string;
    headerText: string;
    headerIcon: string;
    resizeHandle: string;
  }
> = {
  dark: {
    panelBg: "#0f0f12",
    panelBorder: "#2a2a2e",
    headerBg: "#1A1A1D",
    headerBorder: "#2a2a2e",
    displayColor: "#e8e8e8",
    historyColor: "rgb(107, 114, 128)",
    historyEmptyColor: "rgb(75, 85, 99)",
    historyIconColor: "rgb(107, 114, 128)",
    btnDefault: "#1e1e22",
    btnDefaultHover: "#28282d",
    btnDefaultText: "rgb(229, 231, 235)",
    btnOp: "#2a2a2e",
    btnOpHover: "#353539",
    btnOpText: "#b8933a",
    btnEquals: "#b8933a",
    btnEqualsHover: "#d4aa55",
    btnAccent: "rgb(127, 29, 29)",
    btnAccentHover: "rgba(153, 27, 27, 0.6)",
    btnAccentText: "rgb(248, 113, 113)",
    dividerColor: "#2a2a2e",
    copyBtnDefault: "rgb(75, 85, 99)",
    copyBtnHover: "rgb(209, 213, 219)",
    copyBtnActive: "rgb(52, 211, 153)",
    copiedBg: "#059669",
    closeBtnDefault: "rgb(107, 114, 128)",
    closeBtnHover: "rgb(209, 213, 219)",
    closeBtnHoverBg: "rgba(255,255,255,0.05)",
    headerText: "rgb(156, 163, 175)",
    headerIcon: "rgb(107, 114, 128)",
    resizeHandle: "rgb(75, 85, 99)",
  },
  light: {
    panelBg: "#ffffff",
    panelBorder: "#d1d5db",
    headerBg: "#f3f4f6",
    headerBorder: "#e5e7eb",
    displayColor: "#111827",
    historyColor: "rgb(107, 114, 128)",
    historyEmptyColor: "rgb(156, 163, 175)",
    historyIconColor: "rgb(107, 114, 128)",
    btnDefault: "#f3f4f6",
    btnDefaultHover: "#e5e7eb",
    btnDefaultText: "rgb(31, 41, 55)",
    btnOp: "#e5e7eb",
    btnOpHover: "#d1d5db",
    btnOpText: "#b8933a",
    btnEquals: "#b8933a",
    btnEqualsHover: "#d4aa55",
    btnAccent: "rgb(254, 226, 226)",
    btnAccentHover: "rgb(254, 202, 202)",
    btnAccentText: "rgb(220, 38, 38)",
    dividerColor: "#e5e7eb",
    copyBtnDefault: "rgb(156, 163, 175)",
    copyBtnHover: "rgb(75, 85, 99)",
    copyBtnActive: "rgb(16, 185, 129)",
    copiedBg: "#059669",
    closeBtnDefault: "rgb(156, 163, 175)",
    closeBtnHover: "rgb(75, 85, 99)",
    closeBtnHoverBg: "rgba(0,0,0,0.05)",
    headerText: "rgb(75, 85, 99)",
    headerIcon: "rgb(107, 114, 128)",
    resizeHandle: "rgb(156, 163, 175)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CalculatorPanel({
  onClose,
  initialWidth,
  initialHeight,
  onResize,
  sizeMode,
  theme,
  onToggleSizeMode,
  onToggleTheme,
}: CalculatorPanelProps) {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [currentValue, setCurrentValue] = useState("0");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForNextValue, setWaitingForNextValue] = useState(false);
  const [lastOperator, setLastOperator] = useState<string | null>(null);
  const [lastOperand, setLastOperand] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const isLarge = sizeMode === "large";
  const isDark = theme === "dark";
  const t = THEMES[theme];

  // Resize state
  const [panelSize, setPanelSize] = useState({ width: initialWidth, height: initialHeight });
  const resizingRef = useRef(false);
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const resizeRafRef = useRef<number | null>(null);

  // Persist history on change
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  // Notify parent of size changes for persistence
  useEffect(() => {
    onResize?.(panelSize.width, panelSize.height);
  }, [panelSize, onResize]);

  // ── Calculator logic ───────────────────────────────────────────────────

  const handleDigit = useCallback(
    (digit: string) => {
      if (display === "Error") {
        const next = digit === "." ? "0." : appendDigitValue("0", digit);
        setCurrentValue(next);
        setDisplay(next);
        setExpression(next);
        setPreviousValue(null);
        setOperator(null);
        setWaitingForNextValue(false);
        setLastOperator(null);
        setLastOperand(null);
        return;
      }

      if (waitingForNextValue) {
        const next = digit === "." ? "0." : appendDigitValue("0", digit);
        setCurrentValue(next);
        setDisplay(next);
        setExpression(previousValue !== null && operator ? displayExpression(previousValue, operator, next) : next);
        setWaitingForNextValue(false);
        if (previousValue === null && !operator) {
          setLastOperator(null);
          setLastOperand(null);
        }
        return;
      }

      if (digit === "." && currentValue.includes(".")) return;

      const next = appendDigitValue(currentValue, digit);

      setCurrentValue(next);
      setDisplay(next);
      setExpression(previousValue !== null && operator ? displayExpression(previousValue, operator, next) : next);
    },
    [currentValue, display, operator, previousValue, waitingForNextValue],
  );

  const handleOperator = useCallback((op: string) => {
    if (display === "Error") {
      return;
    }

    if (operator && waitingForNextValue) {
      setOperator(op);
      if (previousValue !== null) setExpression(displayExpression(previousValue, op));
      return;
    }

    const inputValue = parseCalculatorValue(currentValue);
    if (inputValue === null) return;

    if (previousValue === null) {
      setPreviousValue(inputValue);
      setExpression(displayExpression(inputValue, op));
    } else if (operator) {
      const result = calculate(previousValue, inputValue, operator);
      if (result === "Error") {
        setDisplay("Error");
        setCurrentValue("Error");
        setExpression("");
        setPreviousValue(null);
        setOperator(null);
        setWaitingForNextValue(true);
        return;
      }

      const numericResult = parseCalculatorValue(result);
      if (numericResult === null) {
        setDisplay("Error");
        setCurrentValue("Error");
        setExpression("");
        setPreviousValue(null);
        setOperator(null);
        setWaitingForNextValue(true);
        return;
      }
      setPreviousValue(numericResult);
      setCurrentValue(result);
      setDisplay(result);
      setExpression(displayExpression(numericResult, op));
      setLastOperator(operator);
      setLastOperand(inputValue);
    }

    setOperator(op);
    setWaitingForNextValue(true);
  }, [currentValue, display, operator, previousValue, waitingForNextValue]);

  const handleEquals = useCallback(() => {
    if (display === "Error") {
      return;
    }

    if (previousValue === null || !operator || waitingForNextValue) {
      if (!operator && lastOperator && lastOperand !== null) {
        const inputValue = parseCalculatorValue(currentValue);
        if (inputValue === null) return;

        const result = calculate(inputValue, lastOperand, lastOperator);
        const exprStr = displayExpression(inputValue, lastOperator, formatNumber(lastOperand));

        setHistory((prev) => [...prev, { expression: exprStr, result }]);
        setDisplay(result);
        setExpression(result === "Error" ? "" : result);
        setCurrentValue(result);
        setPreviousValue(null);
        setOperator(null);
        setWaitingForNextValue(true);
      }
      return;
    }

    const inputValue = parseCalculatorValue(currentValue);
    if (inputValue === null) return;

    const result = calculate(previousValue, inputValue, operator);
    const exprStr = displayExpression(previousValue, operator, currentValue);

    setHistory((prev) => [...prev, { expression: exprStr, result }]);

    setDisplay(result);
    setExpression(result === "Error" ? "" : result);
    setCurrentValue(result);
    setLastOperator(operator);
    setLastOperand(inputValue);
    setPreviousValue(null);
    setOperator(null);
    setWaitingForNextValue(true);
  }, [currentValue, display, lastOperand, lastOperator, operator, previousValue, waitingForNextValue]);

  const handleClear = useCallback(() => {
    setDisplay("0");
    setExpression("");
    setCurrentValue("0");
    setPreviousValue(null);
    setOperator(null);
    setWaitingForNextValue(false);
    setLastOperator(null);
    setLastOperand(null);
  }, []);

  const handleBackspace = useCallback(() => {
    if (display === "Error") {
      handleClear();
      return;
    }

    if (waitingForNextValue) return;

    const rawNext = currentValue.length <= 1 ? "0" : currentValue.slice(0, -1);
    const next = normalizeNumericString(rawNext) ?? "0";
    setCurrentValue(next);
    setDisplay(next);
    setExpression(previousValue !== null && operator ? displayExpression(previousValue, operator, next) : next);
  }, [currentValue, display, handleClear, operator, previousValue, waitingForNextValue]);

  const handlePercent = useCallback(() => {
    if (display === "Error") {
      handleClear();
      return;
    }

    if (previousValue === null || !operator) return;

    const inputValue = parseCalculatorValue(currentValue);
    if (inputValue === null) return;

    const percentValue =
      operator === "+" || operator === "-"
        ? previousValue * (inputValue / 100)
        : inputValue / 100;

    const next = formatNumber(percentValue);
    if (next === "Error") return;

    setCurrentValue(next);
    setDisplay(next);
    setExpression(displayExpression(previousValue, operator, next));
    setWaitingForNextValue(false);
  }, [currentValue, display, handleClear, operator, previousValue]);


  // ── Copy result ────────────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    const raw = display === "Error" ? "" : display;
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — silent */
    }
  }, [display]);

  // ── Keyboard support ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === ".") {
        e.preventDefault();
        handleDigit(".");
      } else if (e.key === "+" || e.key === "-" || e.key === "*" || e.key === "/") {
        e.preventDefault();
        handleOperator(e.key);
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        handleEquals();
      } else if (e.key === "%") {
        e.preventDefault();
        handlePercent();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Escape" || e.key === "c" || e.key === "C") {
        e.preventDefault();
        if (e.key === "Escape") onClose();
        else handleClear();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDigit, handleOperator, handleEquals, handlePercent, handleClear, handleBackspace, onClose]);

  // ── Resize logic ───────────────────────────────────────────────────────

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = true;
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: panelSize.width,
        h: panelSize.height,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [panelSize],
  );

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!resizingRef.current) return;
      if (resizeRafRef.current !== null) return;
      const { clientX, clientY } = e;
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        const dx = clientX - resizeStartRef.current.x;
        const dy = clientY - resizeStartRef.current.y;
        setPanelSize({
          width: Math.max(260, resizeStartRef.current.w + dx),
          height: Math.max(320, resizeStartRef.current.h + dy),
        });
      });
    };
    const handleEnd = () => {
      resizingRef.current = false;
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      if (resizeRafRef.current !== null) cancelAnimationFrame(resizeRafRef.current);
    };
  }, []);

  // ── Button config ──────────────────────────────────────────────────────

  const btnSize = isLarge ? 18 : 14;

  const buttons = [
    { label: "7", action: () => handleDigit("7") },
    { label: "8", action: () => handleDigit("8") },
    { label: "9", action: () => handleDigit("9") },
    { label: "/", action: () => handleOperator("/") },
    { label: "4", action: () => handleDigit("4") },
    { label: "5", action: () => handleDigit("5") },
    { label: "6", action: () => handleDigit("6") },
    { label: "×", action: () => handleOperator("*") },
    { label: "1", action: () => handleDigit("1") },
    { label: "2", action: () => handleDigit("2") },
    { label: "3", action: () => handleDigit("3") },
    { label: "−", action: () => handleOperator("-") },
    { label: "0", action: () => handleDigit("0"), wide: true },
    { label: ".", action: () => handleDigit(".") },
    { label: "=", action: handleEquals },
    { label: "+", action: () => handleOperator("+") },
    { label: "%", action: handlePercent },
    { label: "C", action: handleClear, accent: true },
  ];

  // Formatted display value — replace raw * with × for visual output only
  const formattedDisplay = formatDisplay(display).replace(/\*/g, "×");
  const displayFontSize = isLarge ? "2.5rem" : "2rem";

  return (
    <div
      className="select-none"
      data-calculator-panel
      style={{
        width: panelSize.width,
        height: panelSize.height,
        position: "relative",
        transition: "width 0.2s ease, height 0.2s ease",
      }}
    >
      <div
        className="w-full h-full flex flex-col rounded-xl border shadow-2xl overflow-hidden"
        style={{
          background: t.panelBg,
          borderColor: t.panelBorder,
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0 cursor-default gap-1"
          style={{
            background: t.headerBg,
            borderColor: t.headerBorder,
            transition: "background 0.15s ease, border-color 0.15s ease",
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical size={14} style={{ color: t.headerIcon }} />
            <span className="text-xs font-semibold tracking-wide truncate" style={{ color: t.headerText }}>
              Calculator
            </span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Resize toggle */}
            <button
              onClick={onToggleSizeMode}
              className="p-1 rounded-md transition"
              style={{ color: t.closeBtnDefault }}
              title={isLarge ? "Normal size" : "Large size"}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = t.closeBtnHoverBg;
                (e.currentTarget as HTMLElement).style.color = t.closeBtnHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = t.closeBtnDefault;
              }}
            >
              {isLarge ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            {/* Theme toggle */}
            <button
              onClick={onToggleTheme}
              className="p-1 rounded-md transition"
              style={{ color: t.closeBtnDefault }}
              title={isDark ? "Switch to light theme" : "Switch to dark theme"}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = t.closeBtnHoverBg;
                (e.currentTarget as HTMLElement).style.color = t.closeBtnHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = t.closeBtnDefault;
              }}
            >
              {isDark ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="p-1 rounded-md transition"
              style={{ color: t.closeBtnDefault }}
              title="Close calculator"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = t.closeBtnHoverBg;
                (e.currentTarget as HTMLElement).style.color = t.closeBtnHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = t.closeBtnDefault;
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* History (last 3) */}
        <div className="px-4 pt-2 pb-1 flex-shrink-0 min-h-[48px]">
          {history.length === 0 ? (
            <div className="text-[10px] text-center py-1" style={{ color: t.historyEmptyColor }}>
              No history yet
            </div>
          ) : (
            history.slice(-3).map((entry, i) => (
              <div key={i} className="text-[10px] text-right truncate" style={{ color: t.historyColor }}>
                {entry.expression} = {entry.result}
              </div>
            ))
          )}
        </div>

        {/* Display row */}
        <div className="flex items-end gap-1.5 px-4 pb-3 pt-1 flex-shrink-0">
          <div className="flex-1 flex flex-col items-end min-w-0">
            <div
              className="text-right font-bold tabular-nums overflow-hidden text-ellipsis leading-tight w-full"
              style={{
                fontSize: displayFontSize,
                color: t.displayColor,
                transition: "font-size 0.2s ease, color 0.15s ease",
              }}
              title={expression || display}
            >
              {expression && /[+\-*/]/.test(expression)
                ? expression.replace(/\*/g, "×").replace(/-/g, "−")
                : formattedDisplay}
            </div>
          </div>
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex-shrink-0 p-1 rounded transition mb-1"
            style={{ color: copied ? t.copyBtnActive : t.copyBtnDefault }}
            title="Copy result"
            onMouseEnter={(e) => {
              if (!copied) (e.currentTarget as HTMLElement).style.color = t.copyBtnHover;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = copied ? t.copyBtnActive : t.copyBtnDefault;
            }}
          >
            {copied ? <Check size={btnSize} /> : <Copy size={btnSize} />}
          </button>
        </div>

        {/* Copied tooltip */}
        {copied && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div
              className="text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg"
              style={{ background: t.copiedBg }}
            >
              Copied
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="h-px mx-4" style={{ background: t.dividerColor, transition: "background 0.15s ease" }} />

        {/* Buttons grid */}
        <div className="flex-1 p-2 grid grid-cols-4 gap-1.5 overflow-hidden">
          {buttons.map((btn) => {
            const isAccent = btn.accent;
            const isEquals = btn.label === "=";
            const isOp = ["/", "×", "−", "+", "%"].includes(btn.label);
            let bg = t.btnDefault;
            let hoverBg = t.btnDefaultHover;
            let textColor = t.btnDefaultText;
            if (isAccent) {
              bg = t.btnAccent;
              hoverBg = t.btnAccentHover;
              textColor = t.btnAccentText;
            } else if (isEquals) {
              bg = t.btnEquals;
              hoverBg = t.btnEqualsHover;
              textColor = "#ffffff";
            } else if (isOp) {
              bg = t.btnOp;
              hoverBg = t.btnOpHover;
              textColor = t.btnOpText;
            }
            return (
              <button
                key={btn.label}
                onClick={btn.action}
                className="rounded-lg font-semibold transition active:scale-95 flex items-center justify-center"
                style={{
                  gridColumn: btn.wide ? "span 2" : undefined,
                  background: bg,
                  color: textColor,
                  fontSize: isLarge ? "1.1rem" : "1rem",
                  transition: "background 0.15s ease, color 0.15s ease, transform 0.1s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = hoverBg;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = bg;
                }}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5"
          style={{ touchAction: "none" }}
        >
          <div
            className="w-2 h-2 rounded-sm"
            style={{ background: t.resizeHandle, transition: "background 0.15s ease" }}
          />
        </div>
      </div>
    </div>
  );
}

export default CalculatorPanel;
