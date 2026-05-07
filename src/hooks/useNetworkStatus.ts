import { useState, useEffect, useMemo } from "react";

const SSR_DEFAULTS = {
  isOnline: true,
  hasSyncError: false,
  hasPendingWrites: false,
  isSyncing: false,
  lastSyncAt: undefined as number | undefined,
  lastWriteFailedAt: undefined as number | undefined,
  isProbablyOffline: false,
};

// ── Module-level write-state signals ───────────────────────────────────────
// Lightweight pub/sub so any write caller (or snapshot listener) can report
// real Firestore activity without going through Zustand. Surfaces:
//  - write failures   → reportWriteResult(ok)
//  - pending writes   → reportPendingWrites(bool)  (from snapshot.metadata)
type WriteListener = () => void;
const writeListeners = new Set<WriteListener>();
let lastWriteFailedAtModule: number | undefined = undefined;
let lastSyncAtModule: number | undefined = undefined;
let hasPendingWritesModule = false;

function emit() {
  writeListeners.forEach((fn) => fn());
}

export function reportWriteResult(ok: boolean): void {
  const now = Date.now();
  if (ok) {
    lastWriteFailedAtModule = undefined;
    lastSyncAtModule = now;
  } else {
    lastWriteFailedAtModule = now;
    lastSyncAtModule = undefined;
  }
  emit();
}

export function clearWriteFailure(): void {
  lastWriteFailedAtModule = undefined;
  emit();
}

export function reportPendingWrites(hasPending: boolean): void {
  if (hasPendingWritesModule === hasPending) return;
  hasPendingWritesModule = hasPending;
  // When pending clears with no error, treat that as a fresh sync.
  if (!hasPending && lastWriteFailedAtModule === undefined) {
    lastSyncAtModule = Date.now();
  }
  emit();
}

export function useNetworkStatus(): {
  isOnline: boolean;
  hasSyncError: boolean;
  hasPendingWrites: boolean;
  isSyncing: boolean;
  lastSyncAt?: number;
  lastWriteFailedAt?: number;
  isProbablyOffline: boolean;
} {
  if (typeof window === "undefined") {
    return SSR_DEFAULTS;
  }

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const listener: WriteListener = () => setTick((t) => t + 1);
    writeListeners.add(listener);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      writeListeners.delete(listener);
    };
  }, []);

  const lastWriteFailedAt = lastWriteFailedAtModule;
  const lastSyncAt = lastSyncAtModule;
  const hasPendingWrites = hasPendingWritesModule;
  const hasSyncError = lastWriteFailedAt !== undefined;
  const isSyncing = hasPendingWrites;

  return useMemo(
    () => ({
      isOnline,
      hasSyncError,
      hasPendingWrites,
      isSyncing,
      lastSyncAt,
      lastWriteFailedAt,
      isProbablyOffline: !isOnline || hasSyncError,
    }),
    [isOnline, hasSyncError, hasPendingWrites, isSyncing, lastSyncAt, lastWriteFailedAt],
  );
}
