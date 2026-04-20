/**
 * settingsService.ts — App settings write operations, versioning, and audit logging
 *
 * updateAppSettings  — Partial Firestore merge write to appSettings/config.
 *                      Saves the current config to settingsHistory BEFORE writing.
 * replaceSettings    — Full config replacement (used by rollback).
 * rollbackSettings   — Restores a previous version; logs the rollback event.
 * logAuditEvent      — Structured write to auditLogs collection.
 * validateDeal       — Pre-write validation for deal objects.
 */

import {
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { AppConfig } from "../hooks/useAppSettings";
import type { SettingsVersionEntry } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface AuditPayload {
  userId: number;
  userName: string;
  action: string;
  targetType?: string;
  targetId?: string | number | null;
  before?: unknown;
  after?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore document references
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_DOC     = doc(db, "appSettings", "config");
const HISTORY_COL    = collection(db, "settingsHistory");
const AUDIT_COL      = collection(db, "auditLogs");

// ─────────────────────────────────────────────────────────────────────────────
// Settings versioning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves a snapshot of settings to settingsHistory before an update is applied.
 * Called internally by updateAppSettings and replaceSettings.
 */
async function saveSettingsVersion(opts: {
  previousSettings: unknown;
  newSettings: unknown;
  changedBy: number;
  changedByName: string;
  action: "update" | "rollback";
}): Promise<void> {
  try {
    await addDoc(HISTORY_COL, {
      previousSettings: opts.previousSettings,
      newSettings:      opts.newSettings,
      changedBy:        opts.changedBy,
      changedByName:    opts.changedByName,
      action:           opts.action,
      timestamp:        serverTimestamp(),
    });
  } catch (err) {
    // History write failure should not block the main settings write
    console.warn("[saveSettingsVersion] Failed to write history:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings update (partial merge)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merges partial settings into Firestore. Only provided fields are updated.
 * Saves the CURRENT full config to settingsHistory before writing.
 *
 * @param updates  Nested partial matching AppConfig shape
 * @param opts     Must include userId + userName for audit trail.
 *                 Pass `before` (current full config) so we can snapshot it.
 */
export async function updateAppSettings(
  updates: DeepPartial<AppConfig>,
  opts?: {
    userId?: number | null;
    userName?: string;
    before?: DeepPartial<AppConfig>;
  },
): Promise<void> {
  try {
    // If we don't have a `before` snapshot, try to read it from Firestore
    let previousSettings: unknown = opts?.before ?? null;
    if (!previousSettings) {
      try {
        const snap = await getDoc(CONFIG_DOC);
        if (snap.exists()) previousSettings = snap.data();
      } catch {
        /* non-fatal — we proceed without the snapshot */
      }
    }

    // Save version BEFORE writing new settings
    if (opts?.userId && previousSettings) {
      await saveSettingsVersion({
        previousSettings,
        newSettings: updates,
        changedBy:     opts.userId,
        changedByName: opts.userName ?? "Admin",
        action: "update",
      });
    }

    // Apply the settings update
    await setDoc(CONFIG_DOC, updates, { merge: true });

    // Write audit log (fire-and-forget)
    if (opts?.userId) {
      logAuditEvent({
        userId:     opts.userId,
        userName:   opts.userName ?? "Admin",
        action:     "settings_update",
        targetType: "appSettings",
        before:     previousSettings,
        after:      updates,
      }).catch(console.error);
    }
  } catch (err) {
    console.error("[updateAppSettings] Write failed:", err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings rollback (full replacement)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replaces the current config with a previously saved version.
 * Saves the current settings to history (action: "rollback") before replacing.
 *
 * @param entry   The history entry to restore (contains previousSettings)
 * @param currentConfig  The live config currently in memory (for the snapshot)
 * @param userId
 * @param userName
 */
export async function rollbackSettings(
  entry: Pick<SettingsVersionEntry, "previousSettings" | "id">,
  currentConfig: AppConfig,
  userId: number,
  userName: string,
): Promise<void> {
  try {
    // Save current config to history before rollback
    await saveSettingsVersion({
      previousSettings: currentConfig,
      newSettings:      entry.previousSettings,
      changedBy:        userId,
      changedByName:    userName,
      action:           "rollback",
    });

    // Overwrite the entire config doc (not merge — rollback is a full replace)
    await setDoc(CONFIG_DOC, entry.previousSettings as object);

    // Audit log
    await logAuditEvent({
      userId,
      userName,
      action:     "settings_rollback",
      targetType: "appSettings",
      targetId:   entry.id,
      before:     currentConfig,
      after:      entry.previousSettings,
    });
  } catch (err) {
    console.error("[rollbackSettings] Rollback failed:", err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log writer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appends a structured record to the `auditLogs` Firestore collection.
 * Uses serverTimestamp for cross-timezone consistency.
 * Never throws — failures are silently logged so they never crash the app.
 */
export async function logAuditEvent(payload: AuditPayload): Promise<void> {
  try {
    await addDoc(AUDIT_COL, {
      userId:     payload.userId,
      userName:   payload.userName,
      action:     payload.action,
      targetType: payload.targetType ?? null,
      targetId:   payload.targetId  ?? null,
      before:     payload.before    ?? null,
      after:      payload.after     ?? null,
      timestamp:  serverTimestamp(),
    });
  } catch (err) {
    console.warn("[logAuditEvent] Failed to write audit log:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deal validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_DEAL_STATUSES = new Set(["lead", "conditional", "unconditional", "settled", "lost"]);

/**
 * Validates a deal object before writing to Firestore.
 * Returns `{ valid: true }` or `{ valid: false, errors: [...] }`.
 */
export function validateDeal(deal: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (!deal.clientName || String(deal.clientName).trim() === "") {
    errors.push("Deal must have a client name.");
  }
  if (!deal.status || !VALID_DEAL_STATUSES.has(deal.status as string)) {
    errors.push(`Deal status must be one of: ${[...VALID_DEAL_STATUSES].join(", ")}.`);
  }
  if (
    deal.dealValue !== undefined &&
    (typeof deal.dealValue !== "number" || isNaN(deal.dealValue as number))
  ) {
    errors.push("Deal value must be a valid number.");
  }

  return { valid: errors.length === 0, errors };
}
