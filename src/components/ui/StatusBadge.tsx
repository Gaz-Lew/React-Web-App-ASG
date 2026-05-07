/**
 * StatusBadge.tsx — Reusable status badge component
 * Converts isLocal/isCloud states to Draft/Saved visual indicators
 */

import React from "react";

interface StatusBadgeProps {
  isLocal?: boolean;
  isCloud?: boolean;
  variant?: "draft" | "saved" | "loading";
  className?: string;
}

export function StatusBadge({ isLocal, isCloud, variant, className = "" }: StatusBadgeProps) {
  // Infer variant from isLocal/isCloud if not explicitly provided
  let display = variant;
  if (!display) {
    if (isLocal) display = "draft";
    else if (isCloud) display = "saved";
    else display = "loading";
  }

  const baseClasses =
    "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all";

  const variantClasses = {
    draft: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
    saved: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
    loading: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  };

  const dotClasses = {
    draft: "w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500",
    saved: "w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400",
    loading: "w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse",
  };

  const labelMap = {
    draft: "Draft",
    saved: "Saved",
    loading: "Saving...",
  };

  return (
    <span className={`${baseClasses} ${variantClasses[display]} ${className}`}>
      <span className={dotClasses[display]} />
      {labelMap[display]}
    </span>
  );
}
