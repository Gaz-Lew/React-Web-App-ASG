
interface SkeletonProps {
  className?: string;
  variant?: "text" | "card" | "badge" | "line";
}

export function Skeleton({ className = "", variant = "text" }: SkeletonProps) {
  const baseClasses = "skeleton-shimmer rounded";

  const variantClasses = {
    text: "h-4 w-24",
    line: "h-3 w-full",
    card: "h-24 w-full",
    badge: "h-6 w-16",
  };

  return <div className={`${baseClasses} ${variantClasses[variant]} ${className}`} />;
}

interface SkeletonGroupProps {
  count?: number;
  variant?: "text" | "card" | "line";
  gap?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

export function SkeletonGroup({ count = 3, variant = "line", gap = "md", className = "" }: SkeletonGroupProps) {
  const gapClasses = {
    xs: "gap-1",
    sm: "gap-2",
    md: "gap-3",
    lg: "gap-4",
  };

  return (
    <div className={`flex flex-col ${gapClasses[gap]} ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant={variant} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-white/[0.06] p-4 space-y-3">
      <Skeleton variant="text" className="h-5 w-32" />
      <SkeletonGroup count={3} variant="line" gap="sm" />
    </div>
  );
}
