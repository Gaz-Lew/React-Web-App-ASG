/**
 * DealTimeline.tsx — Renders a timeline of deal events.
 *
 * Events come from the dealEvents collection, ordered by createdAt desc.
 * Supports docusign events and future event types.
 */

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Send, CheckCircle, XCircle, AlertCircle, RefreshCw, FileText, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DealEvent {
  id: string;
  dealId: string;
  type: "docusign_sent" | "docusign_completed" | "docusign_declined" | "docusign_voided" | "docusign_resent" | string;
  message: string;
  createdBy: string;
  createdAt?: { seconds: number; nanoseconds: number };
  metadata?: Record<string, unknown>;
}

interface DealTimelineProps {
  dealId: string;
  maxItems?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event styling
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<
  string,
  {
    icon: LucideIcon;
    iconColor: string;
    bgColor: string;
    label: string;
  }
> = {
  docusign_sent: {
    icon: Send,
    iconColor: "#f59e0b",
    bgColor: "rgba(245,158,11,0.1)",
    label: "Sent for Signing",
  },
  docusign_completed: {
    icon: CheckCircle,
    iconColor: "#22c55e",
    bgColor: "rgba(34,197,94,0.1)",
    label: "Document Signed",
  },
  docusign_declined: {
    icon: XCircle,
    iconColor: "#ef4444",
    bgColor: "rgba(239,68,68,0.1)",
    label: "Declined",
  },
  docusign_voided: {
    icon: AlertCircle,
    iconColor: "#6b7280",
    bgColor: "rgba(107,114,128,0.1)",
    label: "Voided",
  },
  docusign_resent: {
    icon: RefreshCw,
    iconColor: "#3b82f6",
    bgColor: "rgba(59,130,246,0.1)",
    label: "Resent",
  },
};

function fmtTime(timestamp?: { seconds: number; nanoseconds: number }): string {
  if (!timestamp) return "";
  const d = new Date(timestamp.seconds * 1000);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DealTimeline({ dealId, maxItems = 20 }: DealTimelineProps) {
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, "dealEvents"), where("dealId", "==", dealId), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded: DealEvent[] = [];
        snap.forEach((d) => {
          const data = d.data();
          loaded.push({ id: d.id, ...data } as DealEvent);
        });
        setEvents(loaded.slice(0, maxItems));
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsub();
  }, [dealId, maxItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Clock size={16} className="animate-spin text-gray-400 mr-2" />
        <span className="text-xs text-gray-400">Loading timeline…</span>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-6">
        <FileText size={24} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
        <p className="text-xs text-gray-400 dark:text-gray-500">No events recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {events.map((event, i) => {
        const config = EVENT_CONFIG[event.type] || {
          icon: FileText,
          iconColor: "#9ca3af",
          bgColor: "rgba(156,163,175,0.1)",
          label: event.type,
        };
        const Icon = config.icon;
        const isLast = i === events.length - 1;

        return (
          <div key={event.id} className="flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: config.bgColor }}
              >
                <Icon size={14} color={config.iconColor} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-gray-200 dark:bg-white/[0.06] my-1" />}
            </div>

            {/* Content */}
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{config.label}</span>
                <span className="text-[10px] text-gray-400">{fmtTime(event.createdAt)}</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{event.message}</p>
              {event.createdBy && event.createdBy !== "system" && (
                <span className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5 block">by {event.createdBy}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default DealTimeline;
