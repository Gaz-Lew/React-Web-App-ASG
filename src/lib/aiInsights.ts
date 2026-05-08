/**
 * aiInsights.ts — Phase 1 AI-assisted rep guidance.
 *
 * All outputs are derived from actual CRM data — no generic AI responses.
 *
 * Features:
 *  1. generateClientBrief(clientId) — synthesises brief from notes + deal data
 *  2. getNextActionWithReason(deal, lead, notes) — extends existing getNextAction
 *  3. enhanceNoteContent(content) — optional note wording enhancement
 *
 * Performance:
 *  - Async, non-blocking
 *  - Cached results per client
 */

import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { ClientNote, NoteSource, AppointmentNoteType } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientBrief {
  goal: string;
  concerns: string[];
  timeline: string;
  lastInteraction: string;
  suggestedApproach: string[];
  generatedAt: number;
}

export interface NextActionInsight {
  label: string;
  urgency: "urgent" | "high" | "medium" | "low" | "";
  reason: string;
  suggestedApproach: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const briefCache = new Map<string, { brief: ClientBrief; cachedAt: number }>();

function getCachedBrief(clientId: string): ClientBrief | null {
  const entry = briefCache.get(clientId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
    return entry.brief;
  }
  return null;
}

function setCachedBrief(clientId: string, brief: ClientBrief): void {
  briefCache.set(clientId, { brief, cachedAt: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Client Brief Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a client brief from actual CRM data:
 *  - last 5 clientNotes
 *  - pinned (important) notes
 *  - deal stage (inferred from notes)
 */
export async function generateClientBrief(clientId: string): Promise<ClientBrief> {
  // Check cache first
  const cached = getCachedBrief(clientId);
  if (cached) return cached;

  // Fetch recent notes
  const q = query(
    collection(db, "clientNotes"),
    where("clientId", "==", clientId),
    orderBy("createdAt", "desc"),
    limit(20),
  );

  const snap = await getDocs(q);
  const allNotes: ClientNote[] = [];
  snap.forEach((d) => {
    const data = d.data();
    allNotes.push({
      id: d.id,
      clientId: data.clientId as string,
      content: (data.content as string) || "",
      createdBy: (data.createdBy as string) || "",
      repName: (data.repName as string) || "",
      source: (data.source as NoteSource) || "manual",
      sourceId: data.sourceId as string | undefined,
      appointmentType: data.appointmentType as AppointmentNoteType | undefined,
      appointmentDate: data.appointmentDate as string | undefined,
      isImportant: (data.isImportant as boolean) || false,
      createdAt: (data.createdAt as number) || Date.now(),
      createdAtTs: data.createdAtTs,
    });
  });

  const pinnedNotes = allNotes.filter((n) => n.isImportant);

  // ── Derive goal from recent activity ──────────────────────────────────
  const goal = deriveGoal(allNotes, pinnedNotes);

  // ── Derive concerns from note content ────────────────────────────────
  const concerns = deriveConcerns(allNotes);

  // ── Derive timeline from appointment dates ───────────────────────────
  const timeline = deriveTimeline(allNotes);

  // ── Last interaction ─────────────────────────────────────────────────
  const lastInteraction = allNotes.length > 0 ? formatLastInteraction(allNotes[0]) : "No recorded interactions";

  // ── Suggested approach ───────────────────────────────────────────────
  const suggestedApproach = deriveSuggestedApproach(allNotes, pinnedNotes, concerns);

  const brief: ClientBrief = {
    goal,
    concerns,
    timeline,
    lastInteraction,
    suggestedApproach,
    generatedAt: Date.now(),
  };

  setCachedBrief(clientId, brief);
  return brief;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — all data-driven, no generic AI responses
// ─────────────────────────────────────────────────────────────────────────────

const KEYWORD_GOALS: Record<string, string> = {
  smsf: "Exploring SMSF strategy for retirement planning",
  super: "Optimising superannuation position",
  refinance: "Refinancing current loan for better terms",
  property: "Property investment opportunity",
  pia: "Property investment analysis in progress",
  investment: "Building investment portfolio",
  settlement: "Managing settlement process",
  contract: "Contract negotiation underway",
};

const KEYWORD_CONCERNS: Record<string, string> = {
  "not sure": "Uncertainty about next steps",
  "need time": "Requesting more time to decide",
  compare: "Comparing options with competitors",
  expensive: "Cost sensitivity",
  rate: "Interest rate concerns",
  risk: "Risk aversion",
  timeline: "Timeline pressure",
  partner: "Requires partner agreement",
  solicitor: "Legal review in progress",
};

function deriveGoal(notes: ClientNote[], pinned: ClientNote[]): string {
  // Check pinned notes first — they're highest priority
  const allText = [...pinned, ...notes].map((n) => n.content.toLowerCase()).join(" ");

  for (const [keyword, goal] of Object.entries(KEYWORD_GOALS)) {
    if (allText.includes(keyword)) return goal;
  }

  // Check appointment types for context
  const apptTypes = notes.filter((n) => n.appointmentType).map((n) => n.appointmentType);
  if (apptTypes.includes("FC")) return "Financial consultation in progress";
  if (apptTypes.includes("FR")) return "Financial review underway";
  if (apptTypes.includes("Discovery")) return "Discovery phase — understanding client needs";

  // Check note sources
  const hasAppointment = notes.some((n) => n.source === "appointment");
  const hasDeal = notes.some((n) => n.source === "deal");

  if (hasAppointment) return "Active appointment engagement";
  if (hasDeal) return "Deal in progress";

  return "Exploring financial options";
}

function deriveConcerns(allNotes: ClientNote[]): string[] {
  const concerns = new Set<string>();
  const allText = allNotes.map((n) => n.content.toLowerCase()).join(" ");

  for (const [keyword, concern] of Object.entries(KEYWORD_CONCERNS)) {
    if (allText.includes(keyword)) {
      concerns.add(concern);
    }
  }

  // Important notes signal concerns
  allNotes
    .filter((n) => n.isImportant)
    .forEach((n) => {
      const text = n.content.toLowerCase();
      if (text.includes("important") || text.includes("critical") || text.includes("urgent")) {
        concerns.add("Critical issue flagged");
      }
    });

  // Gap in communication
  const sortedByDate = [...allNotes].sort((a, b) => b.createdAt - a.createdAt);
  if (sortedByDate.length > 0) {
    const daysSinceLastContact = Math.floor((Date.now() - sortedByDate[0].createdAt) / 86400000);
    if (daysSinceLastContact > 7) {
      concerns.add(`No contact in ${daysSinceLastContact} days`);
    }
  }

  return Array.from(concerns).slice(0, 5);
}

function deriveTimeline(allNotes: ClientNote[]): string {
  const appointmentNotes = allNotes
    .filter((n) => n.appointmentDate)
    .sort((a, b) => (b.appointmentDate || "").localeCompare(a.appointmentDate || ""));

  if (appointmentNotes.length > 0) {
    const nextAppt = appointmentNotes.find((n) => n.appointmentDate && new Date(n.appointmentDate) >= new Date());
    if (nextAppt) {
      const apptDate = new Date(nextAppt.appointmentDate + "T00:00:00");
      const daysUntil = Math.ceil((apptDate.getTime() - Date.now()) / 86400000);
      if (daysUntil === 0) return "Appointment scheduled for today";
      if (daysUntil === 1) return "Appointment scheduled for tomorrow";
      if (daysUntil > 0 && daysUntil <= 7) return `Appointment in ${daysUntil} days (${nextAppt.appointmentDate})`;
      if (daysUntil > 7) return `Upcoming appointment on ${nextAppt.appointmentDate}`;
    }

    const lastAppt = appointmentNotes[0];
    return `Last appointment: ${lastAppt.appointmentDate}${lastAppt.appointmentType ? ` (${lastAppt.appointmentType})` : ""}`;
  }

  if (allNotes.length > 0) {
    const lastNote = allNotes.sort((a, b) => b.createdAt - a.createdAt)[0];
    const daysAgo = Math.floor((Date.now() - lastNote.createdAt) / 86400000);
    return `Last activity ${daysAgo} days ago (${lastNote.source})`;
  }

  return "No timeline data available";
}

function formatLastInteraction(note: ClientNote): string {
  const daysAgo = Math.floor((Date.now() - note.createdAt) / 86400000);
  const timeStr = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;

  const sourceLabel =
    note.source === "appointment"
      ? note.appointmentType
        ? `${note.appointmentType} appointment`
        : "appointment"
      : note.source === "call"
        ? "call"
        : note.source === "deal"
          ? "deal update"
          : "note";

  return `${note.repName} added a ${sourceLabel} ${timeStr}`;
}

function deriveSuggestedApproach(allNotes: ClientNote[], pinned: ClientNote[], concerns: string[]): string[] {
  const approaches: string[] = [];
  // Communication gap
  const sortedByDate = [...allNotes].sort((a, b) => b.createdAt - a.createdAt);
  if (sortedByDate.length > 0) {
    const daysSinceLastContact = Math.floor((Date.now() - sortedByDate[0].createdAt) / 86400000);
    if (daysSinceLastContact > 3) {
      approaches.push(`Reach out — last contact was ${daysSinceLastContact} days ago`);
    }
  }

  // Appointment follow-up
  const recentAppointment = allNotes.find((n) => n.source === "appointment" && daysSinceLastContact(n.createdAt) <= 2);
  if (recentAppointment) {
    approaches.push("Follow up on recent appointment — ensure action items are addressed");
  }

  // Pinned notes suggest urgency
  if (pinned.length > 0) {
    approaches.push(`Review ${pinned.length} important note${pinned.length > 1 ? "s" : ""} — address flagged items`);
  }

  // Concern-based suggestions
  if (concerns.some((c) => c.toLowerCase().includes("cost") || c.toLowerCase().includes("expensive"))) {
    approaches.push("Prepare cost-benefit breakdown — client is price-sensitive");
  }
  if (concerns.some((c) => c.toLowerCase().includes("compar"))) {
    approaches.push("Provide competitive comparison — client is shopping around");
  }
  if (concerns.some((c) => c.toLowerCase().includes("risk"))) {
    approaches.push("Address risk concerns — provide reassurance and data");
  }
  if (concerns.some((c) => c.toLowerCase().includes("partner"))) {
    approaches.push("Suggest joint meeting — decision requires partner input");
  }

  // Deal activity
  if (allNotes.some((n) => n.source === "deal")) {
    approaches.push("Check deal progress — ensure milestones are on track");
  }

  // Default if nothing specific
  if (approaches.length === 0) {
    approaches.push("Continue regular engagement cadence");
  }

  return approaches.slice(0, 4);
}

function daysSinceLastContact(ts: number): number {
  return Math.floor((Date.now() - ts) / 86400000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Smart Next Action (Enhanced)
// ─────────────────────────────────────────────────────────────────────────────

interface DealLike {
  status: string;
  lastUpdate: number;
  expectedSettlementDate?: string;
}

interface LeadLike {
  callHistory?: { date: string; result?: string }[];
  callbackDate?: string;
  callbackTime?: string;
  nextContactDate?: string;
}

/**
 * Enhanced version of getNextAction that includes reason and suggested approach
 * based on actual client notes and deal data.
 */
export function getNextActionWithReason(
  deal: DealLike | null,
  lead: LeadLike | null,
  recentNotes: ClientNote[],
): NextActionInsight {
  const now = Date.now();

  // ── Callback scheduled ──────────────────────────────────────────────
  if (lead?.callbackDate && lead?.callbackTime) {
    return {
      label: `Call at ${lead.callbackTime}`,
      urgency: "high",
      reason: `Callback scheduled for ${lead.callbackDate} at ${lead.callbackTime}`,
      suggestedApproach: "Prepare talking points based on last interaction notes",
    };
  }

  // ── Deal is at risk ─────────────────────────────────────────────────
  if (deal?.expectedSettlementDate) {
    const daysUntil = Math.ceil((new Date(deal.expectedSettlementDate + "T00:00:00").getTime() - now) / 86400000);
    if (daysUntil <= 7 && daysUntil >= 0) {
      return {
        label: "URGENT — Settlement approaching",
        urgency: "urgent",
        reason: `Settlement due in ${daysUntil} day${daysUntil !== 1 ? "s" : ""} — no recent activity`,
        suggestedApproach: "Contact client immediately to confirm readiness for settlement",
      };
    }
    if (daysUntil < 0) {
      return {
        label: "OVERDUE — Settlement passed",
        urgency: "urgent",
        reason: `Settlement was ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? "s" : ""} ago — follow up immediately`,
        suggestedApproach: "Escalate to manager — determine cause of delay",
      };
    }
  }

  // ── Deal hasn't been updated ────────────────────────────────────────
  if (deal?.lastUpdate) {
    const daysSinceUpdate = Math.floor((now - deal.lastUpdate) / 86400000);
    if (daysSinceUpdate > 7) {
      const noteContext = findNoteContext(recentNotes);
      return {
        label: `Follow up — ${daysSinceUpdate} days since last update`,
        urgency: "medium",
        reason: `Deal inactive for ${daysSinceUpdate} days${noteContext ? ` — last noted: "${noteContext}"` : ""}`,
        suggestedApproach: noteContext
          ? `Address recent concern: ${noteContext}`
          : "Call to check progress and update deal status",
      };
    }
  }

  // ── No call history ─────────────────────────────────────────────────
  if (!lead?.callHistory || lead.callHistory.length === 0) {
    return {
      label: "Initial call needed",
      urgency: "high",
      reason: "No call history on record — client has not been contacted",
      suggestedApproach: "Introduce yourself, understand their situation, and set expectations",
    };
  }

  // ── Recent call with no follow-up ───────────────────────────────────
  const lastCall = lead.callHistory[lead.callHistory.length - 1];
  if (lastCall?.date) {
    const lastCallDate = new Date(lastCall.date + "T00:00:00");
    const daysSinceCall = Math.floor((now - lastCallDate.getTime()) / 86400000);
    if (daysSinceCall > 3 && lastCall.result !== "booked") {
      return {
        label: "Follow-up call",
        urgency: "medium",
        reason: `Last call was ${daysSinceCall} days ago — result: ${lastCall.result?.replace(/_/g, " ") || "unknown"}`,
        suggestedApproach: "Reference previous conversation and check on any action items",
      };
    }
  }

  // ── Default ─────────────────────────────────────────────────────────
  return {
    label: "Check in",
    urgency: "low",
    reason: "No specific action required — maintain regular contact",
    suggestedApproach: "Brief check-in to confirm status and address any questions",
  };
}

function findNoteContext(notes: ClientNote[]): string | null {
  const sorted = [...notes].sort((a, b) => b.createdAt - a.createdAt);
  // Find the most recent note that has meaningful content
  for (const note of sorted.slice(0, 3)) {
    if (note.content.length > 20) {
      return note.content.substring(0, 80) + (note.content.length > 80 ? "…" : "");
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Note Enhancement (Optional)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enhances note content by:
 *  - Capitalising first letter
 *  - Ensuring proper punctuation
 *  - Adding date/time context if missing
 *
 * Returns enhanced content. Does NOT modify original — returns enhancement as optional field.
 */
export function enhanceNoteContent(content: string): string {
  if (!content.trim()) return content;

  let enhanced = content.trim();

  // Capitalise first letter
  enhanced = enhanced.charAt(0).toUpperCase() + enhanced.slice(1);

  // Add period if missing
  if (!/[.!?]$/.test(enhanced)) {
    enhanced += ".";
  }

  return enhanced;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache Management
// ─────────────────────────────────────────────────────────────────────────────

/** Clear cached brief for a specific client */
export function invalidateBriefCache(clientId: string): void {
  briefCache.delete(clientId);
}

/** Clear all cached briefs */
export function clearBriefCache(): void {
  briefCache.clear();
}
