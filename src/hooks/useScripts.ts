/**
 * useScripts.ts — Training script library hook
 *
 * Returns built-in scripts immediately, then merges custom scripts from
 * Firestore `scripts` collection (active === true) once loaded.
 *
 * Built-in scripts cover the five core roleplay scenarios and can be used
 * without any Firestore setup. Custom scripts are additive — no built-ins
 * are replaced or removed.
 *
 * Firestore document shape:
 *   id (auto)  title  category  difficulty  summary  sections[]  tags[]
 *   active: true  createdAt  createdBy  isBuiltin: false
 */

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useFirebaseAuthUser } from "./useFirebaseAuthUser";
import type { ScenarioType } from "../components/AIRoleplay";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ScriptDifficulty = "easy" | "medium" | "hard" | "all";
export type ScriptCategory = ScenarioType | "all";

export interface ScriptSection {
  label: string;       // e.g. "Opening", "Discovery", "Close"
  guidance: string;    // what the rep should achieve in this stage
  keyPhrases?: string[]; // optional example lines
}

export interface TrainingScript {
  id: string;
  title: string;
  category: ScriptCategory;
  difficulty: ScriptDifficulty;
  summary: string;     // one-liner shown in dropdown
  sections: ScriptSection[];
  tags: string[];
  isBuiltin?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in scripts
// ─────────────────────────────────────────────────────────────────────────────

export const BUILTIN_SCRIPTS: TrainingScript[] = [
  // ── Booking Call ───────────────────────────────────────────────────────────
  {
    id: "booking-call-standard",
    title: "Standard Booking Call",
    category: "booking_call",
    difficulty: "all",
    summary: "Core structure: rapport → value → objections → appointment",
    isBuiltin: true,
    tags: ["booking", "phone", "appointment"],
    sections: [
      {
        label: "Opening",
        guidance: "Introduce yourself confidently. State your company and purpose in one clear sentence. Do not ask 'How are you?'",
        keyPhrases: [
          "Hi, this is [name] from ASG.",
          "I'm reaching out because we've been helping people in your area…",
        ],
      },
      {
        label: "Rapport",
        guidance: "Ask one easy, open-ended question about their situation to build connection and uncover motivation.",
        keyPhrases: [
          "How long have you been in the area?",
          "What's prompted you to start looking at your options?",
        ],
      },
      {
        label: "Value Statement",
        guidance: "Briefly explain what you specialise in and why it matters for them specifically. Keep it to two sentences.",
        keyPhrases: [
          "What we specialise in is helping homeowners…",
          "The reason this matters for you is…",
        ],
      },
      {
        label: "Handle Objections",
        guidance: "Acknowledge every concern. Reframe it positively. Never argue. Redirect with a question.",
        keyPhrases: [
          "I completely understand that — a lot of our clients felt the same way.",
          "What if I could show you how we've helped people in the exact same situation?",
        ],
      },
      {
        label: "Appointment Close",
        guidance: "Offer two specific time options — do not ask if they want to meet, ask when. Assume the meeting.",
        keyPhrases: [
          "Are you free Tuesday at 10, or would Wednesday afternoon work better?",
          "Let's lock in 20 minutes — it's no obligation.",
        ],
      },
    ],
  },

  // ── Door Knock ────────────────────────────────────────────────────────────
  {
    id: "door-knock-dq",
    title: "Door Knock — DQ Approach",
    category: "door_knock",
    difficulty: "all",
    summary: "Short, punchy door approach focused on qualifying and booking",
    isBuiltin: true,
    tags: ["door-knock", "DQ", "field"],
    sections: [
      {
        label: "First 5 Seconds",
        guidance: "Smile. State your name and company immediately. Create a reason to keep talking in one sentence.",
        keyPhrases: [
          "Hi! I'm [name] from ASG — just a quick one.",
          "Hi, I'm with ASG — we've been working in this street today.",
        ],
      },
      {
        label: "Hook",
        guidance: "State one compelling benefit or specific result in one sentence. Make it relevant to their suburb.",
        keyPhrases: [
          "We've helped families on this street reduce their repayments by $X per month.",
        ],
      },
      {
        label: "Qualify",
        guidance: "Ask one qualifying question to confirm they own the property and have a mortgage.",
        keyPhrases: [
          "Do you own this property?",
          "Are you currently paying off a mortgage here?",
        ],
      },
      {
        label: "Permission",
        guidance: "If qualified, ask permission to take 2 minutes. Frame it as low commitment.",
        keyPhrases: [
          "Can I grab 2 minutes to show you what that looks like for your situation?",
        ],
      },
      {
        label: "Book",
        guidance: "Move directly to booking a time or DQ form. Don't linger. Two time options only.",
        keyPhrases: [
          "I can come back Tuesday or Thursday — which works for you?",
          "I can do a quick sit-down today at 5 or tomorrow morning.",
        ],
      },
    ],
  },

  // ── First Consult ─────────────────────────────────────────────────────────
  {
    id: "first-consult-discovery",
    title: "First Consult — Discovery Framework",
    category: "first_consult",
    difficulty: "all",
    summary: "Structured discovery questioning for first appointments",
    isBuiltin: true,
    tags: ["FC", "discovery", "questioning", "consult"],
    sections: [
      {
        label: "Set the Agenda",
        guidance: "Tell them how the meeting runs. Structure builds trust and confidence.",
        keyPhrases: [
          "So today I'd like to do three things: understand where you're at, share what we do, and see if there's a fit.",
        ],
      },
      {
        label: "Situation Questions",
        guidance: "Ask open-ended questions about their current financial situation, goals, and timeline.",
        keyPhrases: [
          "How long have you held this property?",
          "What does your ideal outcome look like in the next 2–3 years?",
          "How are things sitting with your current lender?",
        ],
      },
      {
        label: "Problem Questions",
        guidance: "Surface pain points. Let them articulate the problem in their own words.",
        keyPhrases: [
          "What's been the biggest challenge for you with your current setup?",
          "Is there anything that's been frustrating you about your current situation?",
        ],
      },
      {
        label: "Present Solution",
        guidance: "Link your solution directly to what they said. Use their exact words.",
        keyPhrases: [
          "Based on what you've told me about [their concern], what we've found works is…",
        ],
      },
      {
        label: "Next Step",
        guidance: "Always end with a clear, specific next step. Don't leave it vague.",
        keyPhrases: [
          "The logical next step from here is…",
          "Does that make sense as a path forward?",
          "What I'd recommend we do next is…",
        ],
      },
    ],
  },

  // ── Follow Up ─────────────────────────────────────────────────────────────
  {
    id: "follow-up-soft",
    title: "Follow Up — Soft Re-engagement",
    category: "follow_up",
    difficulty: "easy",
    summary: "Re-engage a warm prospect who has gone quiet",
    isBuiltin: true,
    tags: ["follow-up", "re-engagement", "warm"],
    sections: [
      {
        label: "Re-introduce",
        guidance: "Remind them who you are and when you last spoke. Never assume they remember.",
        keyPhrases: [
          "Hi [name], it's [your name] from ASG — we spoke back in [month].",
        ],
      },
      {
        label: "Check In",
        guidance: "Ask how things have progressed since you last spoke. Be genuinely curious, not salesy.",
        keyPhrases: [
          "I wanted to check in and see how things are sitting with you.",
        ],
      },
      {
        label: "Re-qualify",
        guidance: "Gently confirm their situation hasn't changed significantly.",
        keyPhrases: [
          "Has anything shifted for you since we last chatted?",
        ],
      },
      {
        label: "Offer Value",
        guidance: "Share one new relevant piece of information or a market update that justifies the call.",
        keyPhrases: [
          "I've actually come across something since we spoke that made me think of your situation.",
        ],
      },
      {
        label: "Low-Commitment Next Step",
        guidance: "Don't push hard. Offer a light next step they can easily say yes to.",
        keyPhrases: [
          "Would you be open to a quick 15-minute chat to see where things are at?",
        ],
      },
    ],
  },

  // ── Property Sale ─────────────────────────────────────────────────────────
  {
    id: "property-sale-negotiation",
    title: "Property Sale — Negotiation Flow",
    category: "property_sale",
    difficulty: "medium",
    summary: "Navigate valuation, timeline, and process concerns through to agreement",
    isBuiltin: true,
    tags: ["property", "sale", "negotiation"],
    sections: [
      {
        label: "Establish Intent",
        guidance: "Confirm their motivation and timeline up front before discussing any numbers.",
        keyPhrases: [
          "Before we dive into the specifics, can I ask — what's driving the decision to sell right now?",
        ],
      },
      {
        label: "Present Valuation",
        guidance: "Anchor the valuation with comparable sales data. Never lead with the number alone.",
        keyPhrases: [
          "Based on recent comparable sales in the area, we're looking at a range of…",
          "Let me walk you through how I arrived at that figure.",
        ],
      },
      {
        label: "Handle Valuation Objections",
        guidance: "If they push back on price, don't drop it immediately. Ask what figure they had in mind and why.",
        keyPhrases: [
          "That's a fair question — what figure were you expecting, and what's that based on?",
        ],
      },
      {
        label: "Address Timeline & Process",
        guidance: "Reassure them on process steps, contingencies, and how you'll manage complexity.",
        keyPhrases: [
          "Let me walk you through exactly what happens at each stage.",
          "If [scenario] happens, here's our plan B.",
        ],
      },
      {
        label: "Agreement & Next Step",
        guidance: "Summarise what you've agreed on and confirm the next concrete action.",
        keyPhrases: [
          "So to summarise what we've agreed…",
          "The next step is for me to [action]. Does that work for you?",
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseScriptsReturn {
  scripts: TrainingScript[];
  loading: boolean;
  getScriptById: (id: string) => TrainingScript | null;
  getScriptsForCategory: (category: ScriptCategory | string) => TrainingScript[];
}

export function useScripts(): UseScriptsReturn {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [firestoreScripts, setFirestoreScripts] = useState<TrainingScript[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Load custom scripts from Firestore — builtins are always available regardless
    const q = query(collection(db, "scripts"), where("active", "==", true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const custom = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as TrainingScript);
        setFirestoreScripts(custom);
        setLoading(false);
      },
      (err) => {
        console.error("[useScripts] Firestore error:", err);
        // Silently ignore Firestore errors — builtins always work
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authLoading, currentUser]);

  const scripts = [...BUILTIN_SCRIPTS, ...firestoreScripts];

  return {
    scripts,
    loading,
    getScriptById: (id) => scripts.find((s) => s.id === id) ?? null,
    getScriptsForCategory: (cat) =>
      scripts.filter((s) => s.category === cat || s.category === "all" || cat === "all"),
  };
}

export default useScripts;
