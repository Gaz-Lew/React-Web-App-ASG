import { useEffect, useRef } from "react";
import { Lead } from "../types";

// Module-level flag — only request permission once per page load
let permissionRequested = false;

/**
 * Schedules browser notifications for Revisit leads with callbacks due within 24h.
 * Re-runs whenever the leads array changes, but dedups by lead ID so notifications
 * aren't scheduled twice.
 */
export function useCallbackReminders(leads: Lead[]) {
  const scheduledIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!("Notification" in window)) return;

    const schedule = () => {
      const now = Date.now();
      const in24h = now + 24 * 60 * 60 * 1000;

      leads
        .filter((l) => l.status === "contacted" && l.callbackDate && l.callbackTime)
        .forEach((lead) => {
          const key = `${lead.id}-${lead.callbackDate}-${lead.callbackTime}`;
          if (scheduledIds.current.has(key)) return; // already scheduled

          const dt = new Date(`${lead.callbackDate}T${lead.callbackTime}`);
          const ms = dt.getTime() - now;

          if (ms > 0 && dt.getTime() <= in24h) {
            scheduledIds.current.add(key);
            setTimeout(() => {
              if (Notification.permission === "granted") {
                new Notification(`📞 Callback due: ${lead.name}`, {
                  body: `${lead.suburb} — ${lead.callbackTime}`,
                  icon: "/favicon.ico",
                  tag: String(lead.id), // dedups if browser re-shows
                });
              }
            }, ms);
          }
        });
    };

    if (Notification.permission === "granted") {
      schedule();
    } else if (Notification.permission === "default" && !permissionRequested) {
      permissionRequested = true;
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") schedule();
      });
    }
    // If denied, silently skip (banner in Leads.tsx guides user to enable)
  }, [leads]);
}
