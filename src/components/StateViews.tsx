/**
 * StateViews.tsx — Standardised loading, empty, and error state components
 *
 * Provides a consistent visual language for async data states across every
 * dashboard, table, and panel in the CRM.
 *
 * Exported components:
 *   <LoadingSpinner />          — inline spinner (small / default / large)
 *   <LoadingSkeleton />         — shimmer placeholder rows
 *   <LoadingCard />             — full card-height shimmer
 *   <EmptyState />              — friendly "no data" with optional action
 *   <ErrorState />              — error display with optional retry button
 *   <DataStateWrapper />        — unified wrapper: loading → error → empty → children
 */

import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  FileQuestion,
  RefreshCw,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// LoadingSpinner
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const SPINNER_SIZE: Record<string, string> = {
  sm:  "w-4 h-4 border-2",
  md:  "w-6 h-6 border-2",
  lg:  "w-10 h-10 border-[3px]",
};

export function LoadingSpinner({
  size = "md",
  className = "",
  label,
}: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label ?? "Loading…"}
      className={`inline-flex flex-col items-center gap-2 ${className}`}
    >
      <span
        className={`
          ${SPINNER_SIZE[size]}
          rounded-full border-[#b8933a]/30 border-t-[#b8933a]
          animate-spin
        `}
      />
      {label && (
        <span className="text-xs text-[#6b6b65] dark:text-[#8a8a84]">
          {label}
        </span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LoadingSkeleton — shimmer rows
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadingSkeletonProps {
  rows?: number;
  /** If true, adds a narrow leading "avatar" column before each row */
  withAvatar?: boolean;
  className?: string;
}

export function LoadingSkeleton({
  rows = 5,
  withAvatar = false,
  className = "",
}: LoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading content…"
      className={`space-y-3 ${className}`}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          {withAvatar && (
            <div className="w-8 h-8 rounded-full bg-[#e2e2de] dark:bg-[#2e2e2b] shrink-0" />
          )}
          <div className="flex-1 space-y-2">
            <div
              className="h-3 bg-[#e2e2de] dark:bg-[#2e2e2b] rounded"
              style={{ width: `${55 + ((i * 17) % 35)}%` }}
            />
            <div
              className="h-2.5 bg-[#e9e9e5] dark:bg-[#262622] rounded"
              style={{ width: `${30 + ((i * 13) % 40)}%` }}
            />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LoadingCard — full-height card shimmer
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadingCardProps {
  /** Approximate height of the card, e.g. "200px" or "h-48" */
  heightClass?: string;
  className?: string;
}

export function LoadingCard({
  heightClass = "h-48",
  className = "",
}: LoadingCardProps) {
  return (
    <div
      role="status"
      aria-label="Loading…"
      className={`
        ${heightClass}
        rounded-xl bg-[#f5f5f3] dark:bg-[#1a1a18]
        border border-[#e2e2de] dark:border-[#2e2e2b]
        animate-pulse flex flex-col gap-4 p-5
        ${className}
      `}
    >
      <div className="h-4 w-1/3 rounded bg-[#e2e2de] dark:bg-[#2e2e2b]" />
      <div className="flex-1 space-y-3">
        <div className="h-3 w-full rounded bg-[#e9e9e5] dark:bg-[#262622]" />
        <div className="h-3 w-4/5 rounded bg-[#e9e9e5] dark:bg-[#262622]" />
        <div className="h-3 w-2/3 rounded bg-[#e9e9e5] dark:bg-[#262622]" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  /** "page" → full-height centred; "inline" → compact row */
  variant?: "page" | "inline" | "card";
}

export function EmptyState({
  title = "No data yet",
  description,
  icon,
  action,
  className = "",
  variant = "card",
}: EmptyStateProps) {
  const defaultIcon = (
    <FileQuestion
      size={variant === "page" ? 40 : 28}
      className="text-[#b8b8b0] dark:text-[#6b6b65]"
      aria-hidden="true"
    />
  );

  if (variant === "inline") {
    return (
      <div
        className={`flex items-center gap-3 py-4 px-2 text-[#8a8a84] dark:text-[#6b6b65] ${className}`}
      >
        {icon ?? defaultIcon}
        <span className="text-sm">{title}</span>
        {action && (
          <button
            onClick={action.onClick}
            className="ml-auto text-xs font-medium text-[#b8933a] hover:text-[#d4aa55] transition underline underline-offset-2"
          >
            {action.label}
          </button>
        )}
      </div>
    );
  }

  const sizeClasses =
    variant === "page"
      ? "min-h-[40vh] py-20"
      : "py-10";

  return (
    <div
      className={`
        flex flex-col items-center justify-center text-center
        ${sizeClasses} ${className}
      `}
    >
      <div className="mb-4 opacity-60">{icon ?? defaultIcon}</div>
      <p className="text-sm font-semibold text-[#4a4a45] dark:text-[#c0c0b8] mb-1">
        {title}
      </p>
      {description && (
        <p className="text-xs text-[#8a8a84] dark:text-[#6b6b65] max-w-xs">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-4 py-2 rounded-lg bg-[#b8933a] text-white text-xs font-semibold hover:bg-[#d4aa55] active:bg-[#9a7a2e] transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ErrorState
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorStateProps {
  message?: string;
  /** If true, shows AlertTriangle (warning) instead of AlertCircle (error) */
  severity?: "error" | "warning";
  onRetry?: () => void;
  className?: string;
  variant?: "page" | "inline" | "card";
}

export function ErrorState({
  message = "Something went wrong. Please try again.",
  severity = "error",
  onRetry,
  className = "",
  variant = "card",
}: ErrorStateProps) {
  const isError = severity === "error";
  const Icon = isError ? AlertCircle : AlertTriangle;
  const colours = isError
    ? {
        bg:   "bg-red-50 dark:bg-red-900/20",
        border: "border-red-200 dark:border-red-800/40",
        icon: "text-red-500 dark:text-red-400",
        text: "text-red-700 dark:text-red-300",
        sub:  "text-red-500 dark:text-red-400",
      }
    : {
        bg:   "bg-amber-50 dark:bg-amber-900/20",
        border: "border-amber-200 dark:border-amber-700/40",
        icon: "text-amber-500 dark:text-amber-400",
        text: "text-amber-700 dark:text-amber-300",
        sub:  "text-amber-500 dark:text-amber-400",
      };

  if (variant === "inline") {
    return (
      <div
        role="alert"
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg
          border text-xs
          ${colours.bg} ${colours.border} ${colours.text}
          ${className}
        `}
      >
        <Icon size={14} className={colours.icon} aria-hidden="true" />
        <span className="flex-1">{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className={`flex items-center gap-1 font-semibold underline underline-offset-2 ${colours.sub} hover:opacity-80 transition`}
          >
            <RefreshCw size={11} />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`
        flex flex-col items-center justify-center text-center
        ${variant === "page" ? "min-h-[40vh] py-20" : "py-10"}
        ${className}
      `}
    >
      <div className={`mb-3 ${colours.icon}`}>
        <Icon
          size={variant === "page" ? 40 : 28}
          aria-hidden="true"
        />
      </div>
      <p className={`text-sm font-semibold mb-1 ${colours.text}`}>
        {isError ? "Error loading data" : "Warning"}
      </p>
      <p className={`text-xs max-w-xs ${colours.sub}`}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#b8933a] text-white text-xs font-semibold hover:bg-[#d4aa55] transition"
        >
          <RefreshCw size={12} />
          Try Again
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DataStateWrapper — unified state manager
// ─────────────────────────────────────────────────────────────────────────────

export interface DataStateWrapperProps {
  /** True while async data is being fetched */
  loading: boolean;
  /** Error message string, or null/undefined if no error */
  error?: string | null;
  /** True if the data fetched successfully but contains no items */
  isEmpty?: boolean;
  /** Retry callback passed to ErrorState */
  onRetry?: () => void;
  /** Custom loading component; defaults to <LoadingSkeleton /> */
  loadingComponent?: React.ReactNode;
  /** Props passed to EmptyState when isEmpty is true */
  emptyProps?: Omit<EmptyStateProps, "className">;
  /** Props passed to ErrorState when error is set */
  errorProps?: Omit<ErrorStateProps, "message" | "onRetry" | "className">;
  children: React.ReactNode;
  className?: string;
}

/**
 * Renders loading → error → empty → children in the correct priority order.
 *
 * Usage:
 * ```tsx
 * <DataStateWrapper loading={loading} error={error} isEmpty={items.length === 0}>
 *   <MyTable items={items} />
 * </DataStateWrapper>
 * ```
 */
export function DataStateWrapper({
  loading,
  error,
  isEmpty = false,
  onRetry,
  loadingComponent,
  emptyProps,
  errorProps,
  children,
  className = "",
}: DataStateWrapperProps) {
  if (loading) {
    return (
      <div className={className}>
        {loadingComponent ?? <LoadingSkeleton />}
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <ErrorState
          message={error}
          onRetry={onRetry}
          {...(errorProps ?? {})}
        />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={className}>
        <EmptyState {...(emptyProps ?? {})} />
      </div>
    );
  }

  return <>{children}</>;
}
