import { logger } from "./logger";

export type OperationalErrorKind =
  | "auth_denied"
  | "unauthenticated"
  | "validation_failure"
  | "callable_unavailable"
  | "network_failure"
  | "listener_failure"
  | "unknown";

export interface OperationalErrorInfo {
  kind: OperationalErrorKind;
  code: string | null;
  message: string;
  retryable: boolean;
}

export interface DiagnosticContext {
  operation: string;
  collection?: string;
  callable?: string;
  component?: string;
  userId?: number | string | null;
}

function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code.replace(/^(functions|firestore|auth)\//, "") : null;
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function classifyOperationalError(error: unknown): OperationalErrorInfo {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();

  if (code === "permission-denied") {
    return { kind: "auth_denied", code, message: "Authorization denied.", retryable: false };
  }
  if (code === "unauthenticated") {
    return { kind: "unauthenticated", code, message: "Authentication required.", retryable: false };
  }
  if (code === "invalid-argument" || code === "failed-precondition") {
    return { kind: "validation_failure", code, message: "Request validation failed.", retryable: false };
  }
  if (code === "unavailable" || code === "deadline-exceeded" || code === "internal") {
    return { kind: "callable_unavailable", code, message: "Callable service unavailable.", retryable: true };
  }
  if (code === "network-request-failed" || message.includes("network") || message.includes("offline")) {
    return { kind: "network_failure", code, message: "Network failure.", retryable: true };
  }

  return { kind: "unknown", code, message: "Unexpected operational failure.", retryable: true };
}

export function getActionableErrorMessage(error: unknown): string {
  const info = classifyOperationalError(error);
  switch (info.kind) {
    case "auth_denied":
      return "You do not have permission to perform this admin action.";
    case "unauthenticated":
      return "Your session has expired. Please sign in again.";
    case "validation_failure":
      return "The request was rejected. Check the settings values and try again.";
    case "callable_unavailable":
      return "The server action is temporarily unavailable. Please try again shortly.";
    case "network_failure":
      return "Network connection failed. Check your connection and try again.";
    case "listener_failure":
      return "Live updates could not be loaded. Refresh and try again.";
    default:
      if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.slice(0, 160);
      }
      return "Something went wrong. Please try again or contact an administrator.";
  }
}

function diagnosticPayload(context: DiagnosticContext, error: unknown): Record<string, unknown> {
  const info = classifyOperationalError(error);
  return {
    ...context,
    kind: info.kind,
    code: info.code,
    retryable: info.retryable,
  };
}

export function logCallableFailure(context: DiagnosticContext, error: unknown): void {
  logger.error(`[callable] ${context.operation} failed`, diagnosticPayload(context, error));
}

export function logPermissionDenied(context: DiagnosticContext, error: unknown): void {
  logger.warn(`[auth-boundary] ${context.operation} denied`, diagnosticPayload(context, error));
}

export function logListenerFailure(context: DiagnosticContext, error: unknown): void {
  logger.error(`[listener] ${context.operation} failed`, {
    ...diagnosticPayload({ ...context, operation: context.operation }, error),
    kind: "listener_failure",
  });
}

export function logDegradedBehavior(context: DiagnosticContext, reason: string): void {
  logger.warn(`[degraded] ${context.operation}`, { ...context, reason });
}
