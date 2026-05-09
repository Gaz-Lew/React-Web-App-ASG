/**
 * settingsService.ts - server-authoritative settings and audit operations.
 *
 * updateAppSettings - callable-authoritative partial settings update.
 * rollbackSettings  - callable-authoritative restore of a previous version.
 * logAuditEvent     - callable-authoritative audit event creation.
 * validateDeal      - pre-write validation for deal objects.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { getActionableErrorMessage, logCallableFailure } from "./operationalDiagnostics";
import type { AppConfig } from "../hooks/useAppSettings";
import type { SettingsVersionEntry } from "../types";

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

const appendAuditEvent = httpsCallable<AuditPayload, { ok: boolean }>(functions, "appendAuditEvent");
const updateAppSettingsCallable = httpsCallable<
  { updates: DeepPartial<AppConfig>; userName?: string },
  { ok: boolean }
>(functions, "updateAppSettingsCallable");
const rollbackAppSettingsCallable = httpsCallable<
  { previousSettings: unknown; historyId?: string; userName?: string },
  { ok: boolean }
>(functions, "rollbackAppSettingsCallable");

export async function updateAppSettings(
  updates: DeepPartial<AppConfig>,
  opts?: {
    userId?: number | null;
    userName?: string;
    before?: DeepPartial<AppConfig>;
  },
): Promise<void> {
  void opts?.userId;
  void opts?.before;

  try {
    await updateAppSettingsCallable({
      updates,
      userName: opts?.userName ?? "Admin",
    });
  } catch (err) {
    logCallableFailure({ operation: "settings.update", callable: "updateAppSettingsCallable" }, err);
    throw new Error(getActionableErrorMessage(err));
  }
}

export async function rollbackSettings(
  entry: Pick<SettingsVersionEntry, "previousSettings" | "id">,
  currentConfig: AppConfig,
  userId: number,
  userName: string,
): Promise<void> {
  void currentConfig;
  void userId;

  try {
    await rollbackAppSettingsCallable({
      previousSettings: entry.previousSettings,
      historyId: entry.id,
      userName,
    });
  } catch (err) {
    logCallableFailure({ operation: "settings.rollback", callable: "rollbackAppSettingsCallable" }, err);
    throw new Error(getActionableErrorMessage(err));
  }
}

export async function logAuditEvent(payload: AuditPayload): Promise<void> {
  try {
    await appendAuditEvent(payload);
  } catch (err) {
    logCallableFailure({ operation: "audit.append", callable: "appendAuditEvent" }, err);
    throw new Error(getActionableErrorMessage(err));
  }
}

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
