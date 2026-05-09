/**
 * SettingsHistoryPanel.tsx — Settings version log with diff + rollback
 *
 * Displays a reverse-chronological list of all settings changes recorded in the
 * `settingsHistory` Firestore collection. For each entry:
 *  - Shows timestamp, who made the change, and action type (update vs rollback)
 *  - Expandable diff view: before vs after for each changed key
 *  - "Rollback" button that restores the PREVIOUS state for that entry
 *
 * Uses a live onSnapshot listener so new entries appear without a page refresh.
 */

import { useState, useEffect } from "react";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  History,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  User,
  Clock,
  ArrowRight,
  AlertTriangle,
  Loader,
  RefreshCw,
  Info,
} from "lucide-react";
import { rollbackSettings } from "../lib/settingsService";
import { useAppSettings } from "../hooks/useAppSettings";
import { useFirebaseAuthUser } from "../hooks/useFirebaseAuthUser";
import { useAppStore } from "../stores/appStore";
import { handleError } from "../lib/errorHandler";
import { getActionableErrorMessage, logListenerFailure } from "../lib/operationalDiagnostics";
import { DataStateWrapper, LoadingSkeleton } from "./StateViews";
import type { AppConfig } from "../hooks/useAppSettings";
import type { SettingsVersionEntry } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Diff helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flatten a nested object into dot-notation key paths.
 * e.g. { dealSettings: { stuckDaysThreshold: 7 } } → { "dealSettings.stuckDaysThreshold": 7 }
 */
function flattenObject(obj: unknown, prefix = ""): Record<string, unknown> {
  if (typeof obj !== "object" || obj === null) {
    return prefix ? { [prefix]: obj } : {};
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, fullKey));
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}

interface DiffEntry {
  key: string;
  before: unknown;
  after: unknown;
}

function computeDiff(before: unknown, after: unknown): DiffEntry[] {
  const flatBefore = flattenObject(before);
  const flatAfter  = flattenObject(after);
  const allKeys = new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)]);
  const diffs: DiffEntry[] = [];

  for (const key of allKeys) {
    const b = flatBefore[key];
    const a = flatAfter[key];
    // Use JSON comparison to handle booleans / numbers correctly
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diffs.push({ key, before: b, after: a });
    }
  }

  return diffs;
}

function formatValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "Enabled" : "Disabled";
  if (typeof v === "number") return String(v);
  return String(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function DiffRow({ entry }: { entry: DiffEntry }) {
  const label = entry.key
    .split(".")
    .map((s) => s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()))
    .join(" › ");

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 dark:border-white/[0.04] last:border-0 text-xs">
      <span className="flex-1 text-gray-500 dark:text-gray-400 truncate">{label}</span>
      <span className="text-red-500 dark:text-red-400 line-through opacity-80">{formatValue(entry.before)}</span>
      <ArrowRight size={10} className="text-gray-400 flex-shrink-0" />
      <span className="text-green-600 dark:text-green-400 font-medium">{formatValue(entry.after)}</span>
    </div>
  );
}

function ActionBadge({ action }: { action: "update" | "rollback" }) {
  return action === "rollback" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40">
      <RotateCcw size={9} /> Rollback
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700/40">
      <RefreshCw size={9} /> Update
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History entry row (expandable)
// ─────────────────────────────────────────────────────────────────────────────

function HistoryEntryRow({
  entry,
  onRollback,
  isRollingBack,
  canRollback,
}: {
  entry: SettingsVersionEntry;
  onRollback: (entry: SettingsVersionEntry) => void;
  isRollingBack: boolean;
  canRollback: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const diffs = computeDiff(entry.previousSettings, entry.newSettings);

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition flex-shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ActionBadge action={entry.action} />
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <User size={10} /> {entry.changedByName}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <Clock size={10} /> {fmtDate(entry.timestamp)}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {diffs.length} field{diffs.length !== 1 ? "s" : ""} changed
          </p>
        </div>

        {/* Rollback button */}
        {canRollback && (
          <button
            onClick={() => onRollback(entry)}
            disabled={isRollingBack}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRollingBack ? (
              <Loader size={11} className="animate-spin" />
            ) : (
              <RotateCcw size={11} />
            )}
            {isRollingBack ? "Rolling back…" : "Rollback"}
          </button>
        )}
      </div>

      {/* Expanded diff */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-white/[0.04]">
          {diffs.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">
              No field-level changes detected in this snapshot.
            </p>
          ) : (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                Changed Fields
              </p>
              <div>
                {diffs.map((d) => (
                  <DiffRow key={d.key} entry={d} />
                ))}
              </div>
            </div>
          )}

          {/* Raw snapshot toggle */}
          <details className="mt-3">
            <summary className="text-[10px] text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-400 select-none">
              Show raw snapshot (before state)
            </summary>
            <pre className="mt-2 text-[10px] bg-gray-50 dark:bg-black/20 rounded-lg p-3 overflow-x-auto text-gray-600 dark:text-gray-400 leading-relaxed">
              {JSON.stringify(entry.previousSettings, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsHistoryPanel() {
  const { config }      = useAppSettings();
  const { currentUser } = useAppStore();
  const { currentUser: firebaseUser, authLoading } = useFirebaseAuthUser();

  const [entries, setEntries]       = useState<SettingsVersionEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null); // entry id being rolled back
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [rollbackSuccess, setRollbackSuccess] = useState(false);

  // Live listener on settingsHistory, newest first, cap at 50 entries
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!firebaseUser) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "settingsHistory"),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: SettingsVersionEntry[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id:               d.id,
            previousSettings: data.previousSettings ?? {},
            newSettings:      data.newSettings ?? {},
            changedBy:        data.changedBy ?? 0,
            changedByName:    data.changedByName ?? "Unknown",
            action:           data.action ?? "update",
            // Firestore Timestamp → ms
            timestamp: data.timestamp?.toMillis?.() ?? Date.now(),
          } as SettingsVersionEntry;
        });
        setEntries(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logListenerFailure(
          {
            operation: "settingsHistory.listen",
            collection: "settingsHistory",
            component: "SettingsHistoryPanel",
            userId: currentUser?.id ?? null,
          },
          err,
        );
        const appError = handleError(err, "SettingsHistoryPanel");
        setError(getActionableErrorMessage(err) || appError.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [authLoading, firebaseUser]);

  const handleRollback = async (entry: SettingsVersionEntry) => {
    if (!currentUser?.id) return;
    if (!window.confirm(
      `Rollback to the settings snapshot from before this change?\n\nThis will IMMEDIATELY overwrite the current settings for all users.`
    )) return;

    setRollingBack(entry.id);
    setRollbackError(null);
    setRollbackSuccess(false);

    try {
      await rollbackSettings(
        { id: entry.id, previousSettings: entry.previousSettings },
        config as AppConfig,
        currentUser.id,
        currentUser.name ?? "Admin"
      );
      setRollbackSuccess(true);
      setTimeout(() => setRollbackSuccess(false), 4000);
    } catch (err) {
      const appError = handleError(err, "SettingsHistoryPanel.rollback");
      setRollbackError(getActionableErrorMessage(err) || appError.message);
    } finally {
      setRollingBack(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <History size={16} className="text-amber-500" /> Settings History
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          System Controls changes are versioned automatically. Expand any entry to see what changed, or roll back to a previous state.
        </p>
      </div>

      {/* Rollback feedback */}
      {rollbackSuccess && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-sm font-medium text-green-700 dark:text-green-300">
          <RotateCcw size={14} className="flex-shrink-0" />
          Rollback successful — settings have been restored and all users will see the change within seconds.
        </div>
      )}

      {rollbackError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle size={14} className="flex-shrink-0" />
          {rollbackError}
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-2 text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 px-3 py-2.5 rounded-lg border border-blue-200 dark:border-blue-800/40">
        <Info size={12} className="flex-shrink-0 mt-0.5" />
        <span>
          Rollback replaces the <strong>entire</strong> current config with the snapshot captured <em>before</em> the selected change was applied.
          The rollback itself is also versioned — you can always undo a rollback.
        </span>
      </div>

      <DataStateWrapper
        loading={loading}
        error={error ?? undefined}
        isEmpty={!loading && !error && entries.length === 0}
        loadingComponent={<LoadingSkeleton rows={4} />}
        emptyProps={{
          icon: <History size={28} className="text-gray-300 dark:text-gray-600" />,
          title: "No settings changes yet",
          description: "Changes made in System Settings will appear here automatically.",
        }}
      >
        {/* Entry list */}
        <div className="space-y-2">
          {entries.map((entry) => (
            <HistoryEntryRow
              key={entry.id}
              entry={entry}
              onRollback={handleRollback}
              isRollingBack={rollingBack === entry.id}
              canRollback={!!currentUser?.id}
            />
          ))}
        </div>

        {/* Footer note */}
        {entries.length > 0 && (
          <p className="text-[10px] text-center text-gray-400 dark:text-gray-500">
            Showing last {entries.length} change{entries.length !== 1 ? "s" : ""} ·
            Stored in <code className="font-mono">settingsHistory</code> collection
          </p>
        )}
      </DataStateWrapper>
    </div>
  );
}

export default SettingsHistoryPanel;
