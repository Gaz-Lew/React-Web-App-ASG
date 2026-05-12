import type { Lead } from "../types";

export type WorkflowQueueType = "call" | "callback" | "followup" | "booked" | "terminal" | "none";

export interface WorkflowState {
  queueType: WorkflowQueueType;
  priority: "high" | "medium" | "low";
  label: string;
  reason: string;
  dueDate?: string;
  dueTime?: string;
  isActionable: boolean;
  isOverdue: boolean;
}

export interface WorkflowOptions {
  now?: number | Date;
}

const PERTH_TIME_ZONE = "Australia/Perth";
const DAY_MS = 86_400_000;

export function todayInPerth(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: PERTH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function currentPerthDate(options: WorkflowOptions = {}): string {
  const date = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  return todayInPerth(date);
}

export function isValidIsoDate(date?: string | null): date is string {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function isTerminalLeadStatus(status?: string | null): boolean {
  return ["_deleted", "lost", "Not Interested", "Wrong Number"].includes(status ?? "");
}

export function isBookedLeadStatus(status?: string | null): boolean {
  return status === "booked" || status === "Booked";
}

export function hasContactHistory(lead: Lead): boolean {
  return (lead.callHistory?.length ?? 0) > 0 || !!lead.lastCall;
}

export function getLastContactAt(lead: Lead): number | undefined {
  const candidates: number[] = [];
  if (lead.lastCall) {
    const parsed = new Date(lead.lastCall).getTime();
    if (!Number.isNaN(parsed)) candidates.push(parsed);
  }
  for (const call of lead.callHistory ?? []) {
    const isDateOnly = isValidIsoDate(call.date);
    const parsed = isDateOnly ? new Date(`${call.date}T${call.time || "00:00"}`).getTime() : new Date(call.time || call.date).getTime();
    if (!Number.isNaN(parsed)) candidates.push(parsed);
  }
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

export function getWorkflowState(lead: Lead, options: WorkflowOptions = {}): WorkflowState {
  const today = currentPerthDate(options);
  const nowMs = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();

  if (isTerminalLeadStatus(lead.status) || lead.dnqFellOver) {
    return {
      queueType: "terminal",
      priority: "low",
      label: lead.dnqFellOver ? "Lost" : "Closed",
      reason: lead.dnqFellOver ? "Did not qualify" : "Terminal lead status",
      isActionable: false,
      isOverdue: false,
    };
  }

  if (lead.status === "settled" || lead.settlementDate || lead.dealComplete) {
    return {
      queueType: "terminal",
      priority: "low",
      label: "Settled",
      reason: lead.settlementDate ? `Settled ${lead.settlementDate}` : "Deal settled",
      isActionable: false,
      isOverdue: false,
    };
  }

  if (isBookedLeadStatus(lead.status)) {
    const appointmentDate = lead.fcAppt?.date ?? lead.appointmentDate ?? lead.bookingDate;
    return {
      queueType: "booked",
      priority: "low",
      label: "Booked",
      reason: appointmentDate ? `Appointment on ${appointmentDate}` : "Awaiting appointment",
      dueDate: appointmentDate,
      dueTime: lead.appointmentTime ?? lead.bookingTime,
      isActionable: false,
      isOverdue: false,
    };
  }

  if (isValidIsoDate(lead.callbackDate)) {
    const overdue = lead.callbackDate < today;
    const dueToday = lead.callbackDate === today;
    return {
      queueType: "callback",
      priority: overdue || dueToday ? "high" : "medium",
      label: overdue ? "Overdue callback" : lead.callbackTime ? `Call at ${lead.callbackTime}` : "Scheduled callback",
      reason: lead.callbackTime
        ? `Callback ${overdue ? "was due" : "scheduled"} ${lead.callbackDate} at ${lead.callbackTime}`
        : `Callback ${overdue ? "was due" : "scheduled for"} ${lead.callbackDate}`,
      dueDate: lead.callbackDate,
      dueTime: lead.callbackTime,
      isActionable: true,
      isOverdue: overdue,
    };
  }

  if (isValidIsoDate(lead.nextContactDate)) {
    const overdue = lead.nextContactDate < today;
    const dueToday = lead.nextContactDate === today;
    if (overdue || dueToday) {
      return {
        queueType: "followup",
        priority: overdue ? "high" : "medium",
        label: overdue ? "Overdue follow-up" : "Follow up today",
        reason: overdue ? `Follow-up was due ${lead.nextContactDate}` : "Follow-up due today",
        dueDate: lead.nextContactDate,
        isActionable: true,
        isOverdue: overdue,
      };
    }
  }

  if (!hasContactHistory(lead)) {
    return {
      queueType: "call",
      priority: "high",
      label: "Call now",
      reason: "No contact made yet",
      isActionable: true,
      isOverdue: false,
    };
  }

  const lastContactAt = getLastContactAt(lead);
  const daysSinceContact = lastContactAt ? (nowMs - lastContactAt) / DAY_MS : 0;
  if (daysSinceContact > 2) {
    const days = Math.floor(daysSinceContact);
    return {
      queueType: "followup",
      priority: "high",
      label: "Follow up",
      reason: days === 3 ? "No contact in 3 days" : `No contact in ${days} days`,
      isActionable: true,
      isOverdue: true,
    };
  }

  return {
    queueType: "none",
    priority: "low",
    label: "Up to date",
    reason: "No action needed right now",
    isActionable: false,
    isOverdue: false,
  };
}

export function isWorkflowQueueLead(lead: Lead, options: WorkflowOptions = {}): boolean {
  return getWorkflowState(lead, options).isActionable;
}

export function sortWorkflowQueue<T extends { lead: Lead; state: WorkflowState }>(items: T[]): T[] {
  const priority = { high: 0, medium: 1, low: 2 };
  const queue = { callback: 0, followup: 1, call: 2, booked: 3, terminal: 4, none: 5 };
  return [...items].sort((a, b) => {
    const p = priority[a.state.priority] - priority[b.state.priority];
    if (p !== 0) return p;
    const due = (a.state.dueDate ?? "9999-12-31").localeCompare(b.state.dueDate ?? "9999-12-31");
    if (due !== 0) return due;
    return (queue[a.state.queueType] ?? 9) - (queue[b.state.queueType] ?? 9);
  });
}

export function buildInboxDonePatch(lead: Lead, options: WorkflowOptions = {}): Lead {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const date = todayInPerth(now);
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: PERTH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return {
    ...lead,
    status: "contacted",
    lastCall: now.toISOString(),
    callbackDate: null as unknown as string | undefined,
    callbackTime: null as unknown as string | undefined,
    nextContactDate: null as unknown as string | undefined,
    callHistory: [
      ...(lead.callHistory ?? []),
      {
        date,
        time,
        rep: "Inbox",
        result: "connected",
        notes: "Completed from Inbox",
      },
    ],
  };
}
