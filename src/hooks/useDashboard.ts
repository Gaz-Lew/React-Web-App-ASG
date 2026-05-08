/**
 * useDashboard.ts — Hooks for MyDashboard modular widget system
 *
 * Firestore paths:
 *  - users/{userId}/dashboard  — layout, widgets, notes, todo items
 *  - users/{userId}/repSettings — rep-level UI preferences
 *
 * Daily reset:
 *  - On mount: compare today's date against layout.lastResetDate
 *  - If behind: reset widgets with policy "daily", update lastResetDate
 */

import { useState, useEffect, useCallback } from "react";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useFirebaseAuthUser } from "./useFirebaseAuthUser";
import type {
  DashboardLayout,
  DashboardWidgetConfig,
  DashboardWidgetType,
  RepSettings,
  QuickNote,
  TodoItem,
  ChecklistItem,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  { id: "performance_snapshot", enabled: true,  order: 0, resetPolicy: "daily" },
  { id: "today_panel",          enabled: true,  order: 1, resetPolicy: "daily" },
  { id: "focus_panel",          enabled: true,  order: 2, resetPolicy: "daily" },
  { id: "quick_notes",          enabled: true,  order: 3, resetPolicy: "persistent" },
  { id: "pinned_resources",     enabled: true,  order: 4, resetPolicy: "persistent" },
  { id: "todo_list",            enabled: true,  order: 5, resetPolicy: "manual" },
  { id: "checklist",            enabled: false, order: 6, resetPolicy: "daily" },
  { id: "weekly_planner",       enabled: false, order: 7, resetPolicy: "persistent" },
  { id: "affirmations",         enabled: false, order: 8, resetPolicy: "persistent" },
  { id: "notice_board",        enabled: true,  order: 9, resetPolicy: "persistent" },
  { id: "team_board",          enabled: true,  order: 10, resetPolicy: "persistent" },
];

const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: DEFAULT_WIDGETS,
  pinnedItems: [],
  notes: [],
  todoItems: [],
  checklistItems: [],
  affirmations: ["I am confident and capable.", "Every call is an opportunity.", "I help people improve their lives."],
  weeklyPlan: {},
  lastResetDate: "",
  updatedAt: 0,
};

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function applyDailyReset(layout: DashboardLayout): { layout: DashboardLayout; didReset: boolean } {
  const today = todayStr();
  if (layout.lastResetDate === today) return { layout, didReset: false };

  // Reset daily policy items
  const newChecklist = layout.checklistItems.map((item) => {
    const widget = layout.widgets.find((w) => w.id === "checklist");
    return widget?.resetPolicy === "daily" ? { ...item, done: false } : item;
  });

  // Reset daily notes (temporary ones only)
  const newNotes = layout.notes.filter((n) => !n.isTemporary);

  return {
    layout: {
      ...layout,
      checklistItems: newChecklist,
      notes: newNotes,
      lastResetDate: today,
    },
    didReset: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useDashboardLayout
// ─────────────────────────────────────────────────────────────────────────────

export function useDashboardLayout(userId: number | undefined) {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [loading, setLoading] = useState(true);

  const docRef = userId !== undefined ? doc(db, "users", String(userId), "dashboard", "main") : null;

  // Load + subscribe
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !docRef) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = { ...DEFAULT_LAYOUT, ...snap.data() } as DashboardLayout;
          // Merge widget defaults for any new widget types not yet in the stored list
          const storedIds = new Set(data.widgets.map((w) => w.id));
          const missingWidgets = DEFAULT_WIDGETS.filter((w) => !storedIds.has(w.id));
          if (missingWidgets.length > 0) {
            data.widgets = [...data.widgets, ...missingWidgets];
          }
          // Daily reset check
          const { layout: resetLayout, didReset } = applyDailyReset(data);
          if (didReset) {
            // Persist reset silently
            setDoc(docRef, resetLayout, { merge: true }).catch(() => {});
          }
          setLayout(resetLayout);
        } else {
          // First time — seed with defaults
          const seed = { ...DEFAULT_LAYOUT, lastResetDate: todayStr() };
          setDoc(docRef, seed).catch(() => {});
          setLayout(seed);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[useDashboardLayout] Firestore error:", err);
        setLoading(false);
      },
    );

    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser, userId]);

  // Save entire layout
  const saveLayout = useCallback(
    async (updates: Partial<DashboardLayout>) => {
      if (!docRef) return;
      const next = { ...layout, ...updates, updatedAt: Date.now() };
      setLayout(next); // optimistic
      await setDoc(docRef, next, { merge: true });
    },
    [docRef, layout],
  );

  // Widget helpers
  const updateWidget = useCallback(
    (id: DashboardWidgetType, patch: Partial<DashboardWidgetConfig>) => {
      const widgets = layout.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w));
      saveLayout({ widgets });
    },
    [layout, saveLayout],
  );

  const reorderWidgets = useCallback(
    (ordered: DashboardWidgetConfig[]) => {
      const widgets = ordered.map((w, i) => ({ ...w, order: i }));
      saveLayout({ widgets });
    },
    [saveLayout],
  );

  // Notes helpers
  const saveNote = useCallback(
    (note: QuickNote) => {
      const notes = layout.notes.filter((n) => n.id !== note.id);
      saveLayout({ notes: [note, ...notes] });
    },
    [layout, saveLayout],
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      saveLayout({ notes: layout.notes.filter((n) => n.id !== noteId) });
    },
    [layout, saveLayout],
  );

  // Todo helpers
  const saveTodo = useCallback(
    (item: TodoItem) => {
      const existing = layout.todoItems.findIndex((t) => t.id === item.id);
      const todoItems =
        existing >= 0
          ? layout.todoItems.map((t) => (t.id === item.id ? item : t))
          : [item, ...layout.todoItems];
      saveLayout({ todoItems });
    },
    [layout, saveLayout],
  );

  const deleteTodo = useCallback(
    (id: string) => {
      saveLayout({ todoItems: layout.todoItems.filter((t) => t.id !== id) });
    },
    [layout, saveLayout],
  );

  // Checklist helpers
  const saveChecklist = useCallback(
    (items: ChecklistItem[]) => saveLayout({ checklistItems: items }),
    [saveLayout],
  );

  // Pinned resource helpers
  const togglePin = useCallback(
    (item: DashboardLayout["pinnedItems"][number]) => {
      const exists = layout.pinnedItems.find((p) => p.resourceId === item.resourceId);
      const pinnedItems = exists
        ? layout.pinnedItems.filter((p) => p.resourceId !== item.resourceId)
        : [...layout.pinnedItems, item];
      saveLayout({ pinnedItems });
    },
    [layout, saveLayout],
  );

  const isPinned = useCallback(
    (resourceId: string) => layout.pinnedItems.some((p) => p.resourceId === resourceId),
    [layout],
  );

  return {
    layout,
    loading,
    saveLayout,
    updateWidget,
    reorderWidgets,
    saveNote,
    deleteNote,
    saveTodo,
    deleteTodo,
    saveChecklist,
    togglePin,
    isPinned,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useRepSettings
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_REP_SETTINGS: RepSettings = {
  theme: "dark",
  uiScale: "auto",
  notificationsEnabled: true,
  aiGuidanceEnabled: true,
  training: {
    defaultMode: "chat",
    defaultDifficulty: "medium",
  },
  audio: {
    volume: 1,
  },
  updatedAt: 0,
};

export function useRepSettings(userId: number | undefined) {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [settings, setSettings] = useState<RepSettings>(DEFAULT_REP_SETTINGS);
  const [loading, setLoading] = useState(true);

  const docRef = userId !== undefined ? doc(db, "users", String(userId), "repSettings", "main") : null;

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser || !docRef) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_REP_SETTINGS, ...snap.data() } as RepSettings);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[useRepSettings] Firestore error:", err);
        setLoading(false);
      },
    );

    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser, userId]);

  const save = useCallback(
    async (patch: Partial<RepSettings>) => {
      if (!docRef) return;
      const next = { ...settings, ...patch, updatedAt: Date.now() };
      setSettings(next); // optimistic
      await setDoc(docRef, next, { merge: true });
    },
    [docRef, settings],
  );

  return { settings, loading, save };
}

// ─────────────────────────────────────────────────────────────────────────────
// useDailyStatsSnapshot — store daily stats history
// ─────────────────────────────────────────────────────────────────────────────

interface DailyStatsSnapshot {
  date: string;
  calls: number;
  appointments: number;
  deals: number;
  draps: number;
}

export function useSaveDailySnapshot() {
  const save = useCallback(async (userId: number, snapshot: DailyStatsSnapshot) => {
    const ref = doc(db, "users", String(userId), "dailyHistory", snapshot.date);
    await setDoc(ref, { ...snapshot, savedAt: Date.now() }, { merge: true });
  }, []);
  return { save };
}

export function useDailyHistory(userId: number | undefined, days = 30) {
  const [history, setHistory] = useState<DailyStatsSnapshot[]>([]);

  useEffect(() => {
    if (!userId) return;
    // Load last N daily snapshots (simple getDoc for static data)
    const promises: Promise<DailyStatsSnapshot | null>[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const ref = doc(db, "users", String(userId), "dailyHistory", dateStr);
      promises.push(
        getDoc(ref).then((snap) => (snap.exists() ? (snap.data() as DailyStatsSnapshot) : null)),
      );
    }
    Promise.all(promises).then((results) => {
      setHistory(results.filter((r): r is DailyStatsSnapshot => r !== null));
    });
  }, [userId, days]);

  return { history };
}
