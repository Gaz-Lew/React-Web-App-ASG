import { WifiOff, AlertCircle, RefreshCw, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function OfflineIndicator() {
  const { isOnline, hasSyncError, hasPendingWrites, lastSyncAt } = useNetworkStatus();
  // Tick every 30s so "last sync" stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Briefly show a "Synced ✓" pill after lastSyncAt updates
  const [recentlySynced, setRecentlySynced] = useState(false);
  useEffect(() => {
    if (!lastSyncAt) return;
    setRecentlySynced(true);
    const id = setTimeout(() => setRecentlySynced(false), 2000);
    return () => clearTimeout(id);
  }, [lastSyncAt]);

  // Priority: error > offline > syncing > recently-synced > nothing
  if (hasSyncError) {
    return (
      <div className="fixed top-4 right-4 z-[1000] flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 shadow-sm">
        <AlertCircle className="h-3.5 w-3.5" />
        Sync Error
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="fixed top-4 right-4 z-[1000] flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 shadow-sm">
        <WifiOff className="h-3.5 w-3.5" />
        Offline
        {lastSyncAt && <span className="opacity-70 font-normal">· last sync {timeAgo(lastSyncAt)}</span>}
      </div>
    );
  }

  if (hasPendingWrites) {
    return (
      <div className="fixed top-4 right-4 z-[1000] flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 shadow-sm">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Syncing…
      </div>
    );
  }

  if (recentlySynced) {
    return (
      <div className="fixed top-4 right-4 z-[1000] flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 shadow-sm">
        <Check className="h-3.5 w-3.5" />
        Synced
      </div>
    );
  }

  return null;
}
