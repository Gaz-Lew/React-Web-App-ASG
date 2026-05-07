/**
 * userProfileService.ts — Per-user learning profile storage.
 *
 * getUserProfile   — Reads userProfiles/{userId} from Firestore.
 *                    Returns null (never throws) if the document is missing.
 *
 * updateUserProfile — Derives action preference scores from ActionStats and
 *                     writes (or overwrites) userProfiles/{userId}.
 *                     Manual trigger only — no automatic writes.
 *
 * Score formula: score = clamp(successRate * attempts, -5, +5)
 * Equivalent to clamped success count. Clamping is symmetric for
 * forward-compatibility if negative scores are introduced later.
 */

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { ActionStats } from "./learningService";

// ── Public types ──────────────────────────────────────────────────────────────

export interface UserProfile {
  actionPreferences: {
    call: number;
    followup: number;
    book: number;
  };
  updatedAt: number;
  lastProcessedTimestamp: number;
  voiceSampleUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PREF_KEYS = ["call", "followup", "book"] as const;
type PrefKey = (typeof PREF_KEYS)[number];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Reads the user profile for the given userId.
 * Returns null if the document doesn't exist or on any Firestore error.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, "userProfiles", userId));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (err) {
    console.warn("[userProfileService] getUserProfile failed:", err);
    return null;
  }
}

/**
 * Computes action preference scores from the provided stats and writes
 * (full overwrite) to userProfiles/{userId}.
 *
 * Only the three known action keys (call, followup, book) are stored.
 * Stats whose action string does not match a known key contribute 0 to
 * their respective bucket — safe on sparse or empty data.
 */
export async function updateUserProfile(
  userId: string,
  stats: ActionStats[],
  latestTimestamp: number,
): Promise<void> {
  try {
    // Build a lookup: known action key → clamped score
    const scoreMap = new Map<PrefKey, number>();

    for (const stat of stats) {
      const key = stat.action as PrefKey;
      if (!PREF_KEYS.includes(key)) continue;
      const raw = stat.successRate * stat.attempts;
      scoreMap.set(key, clamp(raw, -5, 5));
    }

    const actionPreferences: UserProfile["actionPreferences"] = {
      call: scoreMap.get("call") ?? 0,
      followup: scoreMap.get("followup") ?? 0,
      book: scoreMap.get("book") ?? 0,
    };

    await setDoc(doc(db, "userProfiles", userId), {
      actionPreferences,
      updatedAt: Date.now(),
      lastProcessedTimestamp: latestTimestamp,
    });
  } catch (err) {
    console.warn("[userProfileService] updateUserProfile failed:", err);
  }
}

/**
 * Persists a voice sample URL onto the user profile without touching any
 * other fields. Creates the document if it doesn't exist yet (merge: true).
 */
export async function saveVoiceSampleUrl(userId: string, url: string): Promise<void> {
  try {
    const ref = doc(db, "userProfiles", userId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { voiceSampleUrl: url, updatedAt: Date.now() });
    } else {
      await setDoc(ref, { voiceSampleUrl: url, updatedAt: Date.now() }, { merge: true });
    }
  } catch (err) {
    console.warn("[userProfileService] saveVoiceSampleUrl failed:", err);
    throw err;
  }
}
