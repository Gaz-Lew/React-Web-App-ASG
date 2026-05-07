import { useState, useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { getActionStats, getGlobalActionStats } from "../../services/learningService";
import type { ActionStats } from "../../services/learningService";

export function LearningDebugPanel() {
  if (!import.meta.env.DEV) return null;

  return <Panel />;
}

function Panel() {
  const { currentUser, activeRegion } = useAppStore();
  const [userStats, setUserStats] = useState<ActionStats[]>([]);
  const [globalStats, setGlobalStats] = useState<ActionStats[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [user, global] = await Promise.all([
        getActionStats(String(currentUser.id), activeRegion),
        getGlobalActionStats(activeRegion),
      ]);
      setUserStats(user.stats);
      setGlobalStats(global);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    refetch();
  }, [currentUser?.id, activeRegion]);

  if (!currentUser) return null;

  const userMap = Object.fromEntries(userStats.map((s) => [s.action, s]));
  const globalMap = Object.fromEntries(globalStats.map((s) => [s.action, s]));
  const allActions = Array.from(new Set([...userStats.map((s) => s.action), ...globalStats.map((s) => s.action)]));

  type Row = { action: string; userRate: number | null; userAttempts: number; globalRate: number | null; globalAttempts: number; finalRate: number | null };

  const rows: Row[] = allActions.map((action) => {
    const u = userMap[action];
    const g = globalMap[action];
    const userRate = u != null ? u.successRate : null;
    const globalRate = g != null ? g.successRate : null;
    let finalRate: number | null = null;
    if (userRate != null && globalRate != null) finalRate = userRate * 0.7 + globalRate * 0.3;
    else if (userRate != null) finalRate = userRate;
    else if (globalRate != null) finalRate = globalRate;
    return { action, userRate, userAttempts: u?.attempts ?? 0, globalRate, globalAttempts: g?.attempts ?? 0, finalRate };
  });

  rows.sort((a, b) => {
    const fa = a.finalRate ?? a.userRate ?? a.globalRate ?? -1;
    const fb = b.finalRate ?? b.userRate ?? b.globalRate ?? -1;
    return fb - fa;
  });

  const fmt = (rate: number | null, attempts: number) =>
    rate != null ? `${Math.round(rate * 100)}% (${attempts})` : "—";

  const hasData = rows.length > 0;

  return (
    <div className="fixed bottom-4 right-4 z-[999] bg-black/70 text-white px-3 py-2 rounded-lg shadow-lg text-xs opacity-80 min-w-[180px]">
      <div className="flex items-center justify-between mb-1.5">
        <p className="font-semibold text-[10px] uppercase tracking-wider text-gray-400">Learning Stats</p>
        <button onClick={refetch} disabled={loading} className="text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors leading-none" title="Refresh">↻</button>
      </div>
      <p className="text-[9px] text-amber-400 mb-1 font-medium capitalize">Region: {activeRegion}</p>
      <p className="text-[9px] text-gray-500 mb-1.5">U = user · G = global · F = blended</p>
      {loading ? (
        <p className="text-gray-400">Learning…</p>
      ) : !hasData ? (
        <p className="text-gray-400">No learning data yet</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.action}>
              <p className="text-gray-200 font-medium mb-0.5">{r.action}</p>
              <div className="space-y-px pl-1 font-mono">
                <p className="text-gray-400">U: {fmt(r.userRate, r.userAttempts)}</p>
                <p className="text-gray-400">G: {fmt(r.globalRate, r.globalAttempts)}</p>
                <p className="text-white font-medium">F: {r.finalRate != null ? `${Math.round(r.finalRate * 100)}%` : "—"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
