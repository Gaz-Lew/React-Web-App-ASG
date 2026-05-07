import React, { useMemo } from "react";
import { useLeads } from "../hooks/useFirebase";
import { useAppStore } from "../stores/appStore";
import { getNextAction } from "../lib/nextAction";
import { Sparkles } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isToday(iso: string | undefined): boolean {
  if (!iso) return false;
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function isWithin24h(val: string | number | undefined): boolean {
  if (val == null) return false;
  const t = typeof val === "number" ? val : new Date(val).getTime();
  return Date.now() - t < 86_400_000;
}

function isOverdueCallback(lead: { callbackDate?: string; callbackTime?: string }): boolean {
  if (!lead.callbackDate) return false;
  const cb = new Date(`${lead.callbackDate}T${lead.callbackTime ?? "23:59"}`);
  return cb.getTime() < Date.now();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Narrative builder ─────────────────────────────────────────────────────────

interface Brief {
  overdue: number;
  todayCallbacks: number;
  newLeads: number;
  highPriority: number;
  topNames: string[];    // up to 3 names for the priority sentence
}

function buildBrief(leads: ReturnType<typeof useLeads>["leads"], userId?: number): Brief {
  const myLeads = userId ? leads.filter((l) => l.dqRep === userId) : leads;

  const overdue = myLeads.filter(isOverdueCallback).length;
  const todayCallbacks = myLeads.filter(
    (l) => l.callbackDate && isToday(l.callbackDate) && !isOverdueCallback(l),
  ).length;
  const newLeads = leads.filter((l) => isWithin24h(l.createdAt ?? (l.leadDate != null ? String(l.leadDate) : undefined))).length;

  const highPriorityLeads = myLeads
    .filter((l) => getNextAction(l).priority === "high")
    .slice(0, 3);

  return {
    overdue,
    todayCallbacks,
    newLeads,
    highPriority: highPriorityLeads.length,
    topNames: highPriorityLeads.map((l) => l.name.split(" ")[0]),
  };
}

function buildNarrative(brief: Brief, name: string): string[] {
  const lines: string[] = [];

  lines.push(`${greeting()}, ${name}.`);

  if (brief.overdue >= 10) {
    lines.push(`You have ${brief.overdue} overdue callbacks. This is critical and needs to be addressed now.`);
  } else if (brief.overdue >= 5) {
    lines.push(`You have ${brief.overdue} overdue callbacks that need immediate attention.`);
  } else if (brief.overdue === 1) {
    lines.push("You have 1 overdue callback that needs attention.");
  } else if (brief.overdue > 1) {
    lines.push(`You have ${brief.overdue} overdue callbacks that need attention.`);
  } else {
    lines.push("You're up to date.");
  }

  if (brief.todayCallbacks > 0) {
    lines.push(
      brief.todayCallbacks === 1
        ? "1 callback is scheduled for today."
        : `${brief.todayCallbacks} callbacks are scheduled for today.`,
    );
  }

  if (brief.highPriority > 0) {
    const nameStr =
      brief.topNames.length > 0
        ? ` — starting with ${brief.topNames.join(", ")}`
        : "";
    lines.push(
      brief.highPriority === 1
        ? `You have 1 high priority opportunity${nameStr}.`
        : `You have ${brief.highPriority} high priority opportunities${nameStr}.`,
    );
  }

  if (brief.newLeads > 0) {
    lines.push(
      brief.newLeads === 1
        ? "1 new lead came in during the last 24 hours."
        : `${brief.newLeads} new leads came in during the last 24 hours.`,
    );
  }

  lines.push("Focus on your highest priority leads first.");

  return lines;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function NarrativeSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[70, 90, 55, 80].map((w, i) => (
        <div key={i} className="h-4 rounded skeleton-shimmer" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AssistantPage() {
  const { leads, loading } = useLeads();
  const { currentUser } = useAppStore();

  const brief = useMemo(
    () => (loading ? null : buildBrief(leads, currentUser?.id)),
    [leads, loading, currentUser?.id],
  );

  const narrative = useMemo(
    () => (brief ? buildNarrative(brief, currentUser?.name?.split(" ")[0] ?? "there") : []),
    [brief, currentUser?.name],
  );

  return (
    <div className="flex-1 flex flex-col bg-[var(--surface)] overflow-y-auto">
      <div className="max-w-xl mx-auto w-full px-6 py-16">

        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-8"
          style={{ background: "rgba(184,147,58,0.12)" }}>
          <Sparkles size={18} style={{ color: "#b8933a" }} />
        </div>

        {/* Narrative */}
        {loading ? (
          <NarrativeSkeleton />
        ) : (
          <div className="space-y-4">
            {narrative.map((line, i) => (
              <p
                key={i}
                className={`leading-relaxed ${
                  i === 0
                    ? "text-xl font-semibold text-[var(--text)]"
                    : "text-base text-[var(--text-muted)]"
                }`}
              >
                {line}
              </p>
            ))}
          </div>
        )}

        {/* Stats row */}
        {!loading && brief && (
          <div className="mt-12 flex gap-6 flex-wrap">
            {[
              { label: "Overdue", value: brief.overdue, urgent: brief.overdue > 0 },
              { label: "Today", value: brief.todayCallbacks, urgent: false },
              { label: "New (24h)", value: brief.newLeads, urgent: false },
              { label: "High priority", value: brief.highPriority, urgent: brief.highPriority > 0 },
            ].map(({ label, value, urgent }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className={`text-2xl font-bold tabular-nums ${urgent ? "text-amber-500" : "text-[var(--text)]"}`}>
                  {value}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
