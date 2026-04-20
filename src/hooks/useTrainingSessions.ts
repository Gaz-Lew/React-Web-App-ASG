/**
 * useTrainingSessions.ts — Standalone training session hooks
 *
 * Re-exports the existing useTrainingSessions from useFirebase (for
 * convenience imports), and adds useSingleTrainingSession for fetching
 * one session by ID (used by the RoleplayReplay component).
 *
 * Usage:
 *   import { useTrainingSessions } from "../hooks/useTrainingSessions";
 *   import { useSingleTrainingSession } from "../hooks/useTrainingSessions";
 */

export { useTrainingSessions } from "./useFirebase";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { RoleplaySession } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// useSingleTrainingSession
// ─────────────────────────────────────────────────────────────────────────────

interface UseSingleSessionReturn {
  session: RoleplaySession | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches one training session document by ID.
 * Used by RoleplayReplay to load a session that's already in the
 * sessions list (so we only hit Firestore once — the list listener
 * already has the data, but this hook is provided for standalone use).
 */
export function useSingleTrainingSession(sessionId: string | null): UseSingleSessionReturn {
  const [session, setSession] = useState<RoleplaySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    getDoc(doc(db, "trainingSessions", sessionId))
      .then((snap) => {
        if (snap.exists()) {
          setSession({ ...snap.data(), id: snap.id } as RoleplaySession);
        } else {
          setError("Session not found.");
        }
      })
      .catch((err: Error) => {
        setError(err.message ?? "Failed to load session.");
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { session, loading, error };
}
