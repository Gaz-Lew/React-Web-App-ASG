/**
 * errorHandler.ts — Global error handling utility
 *
 * handleError(error, context?)  — logs to console + Firestore `errors` collection
 * getErrorMessage(error)        — extracts a safe, user-friendly message
 * isFirestoreError(error)       — type-guard for Firebase/Firestore error codes
 * withErrorHandling(fn, ctx)    — wraps an async fn with automatic error catching
 *
 * Design principles:
 *  - Never exposes raw stack traces or Firestore internal codes to end users
 *  - Always logs full detail to console + Firestore for admin visibility
 *  - Never throws — error logging itself must never crash the app
 */

import { collection, addDoc } from "firebase/firestore";
import { db } from "./firebase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AppError {
  /** Short user-friendly description — safe to display in UI */
  message: string;
  /** Technical context for logging (e.g. component or operation name) */
  context: string;
  /** Original raw error object */
  originalError: unknown;
  /** Timestamp of when the error was captured */
  timestamp: number;
  /** Firestore error code if applicable */
  code?: string;
}

/** Subset stored in the `errors` Firestore collection */
interface ErrorLog {
  userId: string;
  context: string;
  message: string;
  code: string | null;
  stack: string | null;
  timestamp: number;
  date: string;
  userAgent: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// User-friendly message mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Map Firebase / network error codes to plain-English messages */
const FRIENDLY_MESSAGES: Record<string, string> = {
  // Firestore
  "permission-denied":        "You don't have permission to perform this action.",
  "not-found":                "The requested data could not be found.",
  "already-exists":           "This record already exists.",
  "resource-exhausted":       "Too many requests — please try again in a moment.",
  "failed-precondition":      "This action cannot be completed right now.",
  "unavailable":              "The service is temporarily unavailable. Check your connection.",
  "deadline-exceeded":        "The request timed out. Please try again.",
  "cancelled":                "The operation was cancelled.",
  "unauthenticated":          "Your session has expired. Please sign in again.",
  // Network
  "network-request-failed":   "Network error — check your internet connection.",
  // Storage
  "storage/quota-exceeded":   "Storage quota exceeded. Contact support.",
  "storage/unauthenticated":  "Not authorised to access this file.",
  // Generic
  "internal":                 "An internal error occurred. It has been reported.",
  "unknown":                  "An unexpected error occurred. Please try again.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Type guard
// ─────────────────────────────────────────────────────────────────────────────

export function isFirestoreError(
  err: unknown
): err is { code: string; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as Record<string, unknown>).code === "string"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract user-facing message
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts any caught value into a short, user-safe string.
 * Never returns raw Firestore codes, stack traces, or internal IDs.
 */
export function getErrorMessage(error: unknown): string {
  if (isFirestoreError(error)) {
    // Strip the "firestore/" or "storage/" prefix if present
    const bare = error.code.replace(/^(firestore|storage|functions|auth)\//, "");
    return FRIENDLY_MESSAGES[bare] ?? FRIENDLY_MESSAGES["unknown"];
  }
  if (error instanceof Error) {
    // If it's a plain JS error, use the message but cap length
    const msg = error.message.slice(0, 120);
    // Don't leak technical detail if it looks like a Firestore path or code
    if (/[A-Z0-9_]{2,}\/[A-Z0-9_]{2,}/i.test(msg)) {
      return FRIENDLY_MESSAGES["unknown"];
    }
    return msg || FRIENDLY_MESSAGES["unknown"];
  }
  if (typeof error === "string") {
    return error.slice(0, 120) || FRIENDLY_MESSAGES["unknown"];
  }
  return FRIENDLY_MESSAGES["unknown"];
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore error logger (best-effort, never throws)
// ─────────────────────────────────────────────────────────────────────────────

async function persistErrorToFirestore(
  appError: AppError,
  userId: string
): Promise<void> {
  try {
    const log: ErrorLog = {
      userId,
      context:   appError.context,
      message:   appError.message,
      code:      appError.code ?? null,
      stack:
        appError.originalError instanceof Error
          ? (appError.originalError.stack ?? null)
          : null,
      timestamp: appError.timestamp,
      date:      new Date(appError.timestamp).toISOString().split("T")[0],
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    };
    await addDoc(collection(db, "errors"), log);
  } catch {
    // Silently swallow — Firestore logging must never cascade into another error
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified error handler for the ASG CRM platform.
 *
 * - Logs full detail to console (always)
 * - Persists a structured error log to Firestore `errors` collection
 * - Returns an `AppError` with a user-safe `message` field
 *
 * @param error     The caught value (any type)
 * @param context   Where the error occurred, e.g. "CallLogger.save" or "useLeads"
 * @returns         AppError — use `.message` for UI display
 */
export function handleError(error: unknown, context = "unknown"): AppError {
  const code = isFirestoreError(error) ? error.code : undefined;
  const message = getErrorMessage(error);
  const timestamp = Date.now();

  const appError: AppError = {
    message,
    context,
    originalError: error,
    timestamp,
    code,
  };

  // Always log full detail to console for devtools visibility
  console.error(`[${context}]`, error);

  // Persist to Firestore asynchronously (fire-and-forget)
  const userId = localStorage.getItem("asg-crm:userId") ?? "unknown";
  void persistErrorToFirestore(appError, userId);

  return appError;
}

// ─────────────────────────────────────────────────────────────────────────────
// withErrorHandling — async wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps an async function so that any thrown error is automatically:
 *  - caught and handled via `handleError`
 *  - passed to an optional `onError` callback
 *  - never re-thrown (the returned Promise always resolves)
 *
 * @example
 * const safeSave = withErrorHandling(saveLead, "Leads.saveLead", (err) => {
 *   setError(err.message);
 * });
 * await safeSave(leadData);
 */
export function withErrorHandling<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  context: string,
  onError?: (appError: AppError) => void
): (...args: TArgs) => Promise<TReturn | undefined> {
  return async (...args: TArgs): Promise<TReturn | undefined> => {
    try {
      return await fn(...args);
    } catch (err) {
      const appError = handleError(err, context);
      onError?.(appError);
      return undefined;
    }
  };
}
