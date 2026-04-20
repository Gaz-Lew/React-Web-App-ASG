// Knowledge Base V2 – structured training data for AI guidance
// -----------------------------------------------------------
// This file centralises objections, scripts, scenarios, and decision trees
// to power the AI guidance system.

export interface ObjectionCategory {
  type: "risk" | "price" | "trust" | "timing";
  triggers: string[];
  meaning: string;
  approach: string;
  script: string;
}

export interface ScriptCategory {
  type: string; // e.g. "firstContact", "followUp", "booking", "closing"
  whenToUse: string;
  script: string;
  variation?: string;
  mistakes?: string[];
}

export interface Scenario {
  id: string;
  title: string;
  personality: string;
  difficulty: number;
  commonObjections: string[];
  goal: string;
  recommendedApproach: string;
}

export interface DecisionTreeStep {
  action: string;
}
export interface DecisionTree {
  trigger: string;
  steps: DecisionTreeStep[];
}

/* ── OBJECTIONS ──────────────────────────────────────────────────────── */

export const objections: ObjectionCategory[] = [
  {
    type: "risk",
    triggers: ["risk", "unsafe", "worried", "scared"],
    meaning: "Lead expresses concern about potential negative outcomes",
    approach: "Reassure with low‑risk strategies and data",
    script:
      "Hi ${fn}, I understand the risk concerns — our approach focuses on steady, low‑risk growth tailored for you.",
  },
  {
    type: "price",
    triggers: ["expensive", "cost", "afford", "price"],
    meaning: "Lead questions the investment value",
    approach: "Reframe value and ROI",
    script:
      "Hi ${fn}, I appreciate the focus on cost — we’ll highlight the strong value you’ll get for the investment.",
  },
  {
    type: "trust",
    triggers: ["not sure", "dodgy", "scam", "legit"],
    meaning: "Lead doubts credibility or legitimacy",
    approach: "Provide proof points and social validation",
    script: "Hi ${fn}, I get the hesitation and can share proven results from similar clients.",
  },
  {
    type: "timing",
    triggers: ["not now", "later", "busy"],
    meaning: "Lead indicates current inopportune moment",
    approach: "Schedule low‑pressure follow‑up",
    script: "Hi ${fn}, I see timing isn’t right now — let’s schedule a quick check‑in later this week.",
  },
];

/* ── SCRIPTS ─────────────────────────────────────────────────────────── */

export const scripts: ScriptCategory[] = [
  {
    type: "firstContact",
    whenToUse: "Initial outreach when no prior contact",
    script:
      "Hi ${fn}, this is [Your Name] from ASG. We specialise in helping WA ${ownerOrRenterPlaceholder} build long‑term wealth through property. I just wanted to introduce myself — do you have two minutes?",
  },
  {
    type: "followUp",
    whenToUse: "Re‑engagement after a period of inactivity",
    script:
      "Hi ${fn}, it's [Your Name] from ASG — we spoke recently about building your financial position. I just wanted to follow up and see where things are at on your end.",
  },
  {
    type: "booking",
    whenToUse: "Lead is ready to progress to a formal appointment",
    script:
      "Based on what we've discussed, the natural next step is to book a ${apptType}. I have availability on [Day 1] or [Day 2] — which works better for you?",
  },
  {
    type: "closing",
    whenToUse: "Final push to secure commitment",
    script: "Do you have any final questions before we lock in the appointment?",
  },
];

/* Placeholder for ownerOrRenter interpolation – replace with actual lead data at runtime */
const ownerOrRenterPlaceholder = "ownerOrRenter(lead)";

/* ── SCENARIOS ─────────────────────────────────────────────────────── */

export const scenarios: Scenario[] = [
  {
    id: "1",
    title: "Introductory Call",
    personality: "Analytical",
    difficulty: 1,
    commonObjections: ["price"],
    goal: "Establish basic qualification",
    recommendedApproach: "Focus on value and ROI",
  },
  {
    id: "2",
    title: "Risk‑Averse Lead",
    personality: "Cautious",
    difficulty: 2,
    commonObjections: ["risk"],
    goal: "Address safety concerns",
    recommendedApproach: "Highlight low‑risk strategies",
  },
  {
    id: "3",
    title: "Budget‑Conscious Prospect",
    personality: "Frugal",
    difficulty: 2,
    commonObjections: ["price"],
    goal: "Demonstrate cost‑effectiveness",
    recommendedApproach: "Break down ROI",
  },
  {
    id: "4",
    title: "Trust‑Seeker",
    personality: "Skeptical",
    difficulty: 3,
    commonObjections: ["trust"],
    goal: "Build credibility",
    recommendedApproach: "Share testimonials and proof points",
  },
  {
    id: "5",
    title: "Busy Executive",
    personality: "Time‑pressed",
    difficulty: 1,
    commonObjections: ["timing"],
    goal: "Reschedule gently",
    recommendedApproach: "Offer quick check‑in",
  },
  {
    id: "6",
    title: "Decision‑Makers",
    personality: "Collaborative",
    difficulty: 3,
    commonObjections: ["risk", "price"],
    goal: "Align with stakeholder concerns",
    recommendedApproach: "Present combined value and risk mitigation",
  },
];

/* ── DECISION TREES ──────────────────────────────────────────────── */

export const decisionTrees: DecisionTree[] = [
  {
    trigger: "risk",
    steps: [{ action: "Acknowledge concern" }, { action: "Reframe value" }, { action: "Ask a question" }],
  },
  {
    trigger: "price",
    steps: [{ action: "Acknowledge concern" }, { action: "Reframe value" }, { action: "Ask a question" }],
  },
  {
    trigger: "trust",
    steps: [{ action: "Acknowledge concern" }, { action: "Provide proof" }, { action: "Ask a question" }],
  },
  {
    trigger: "timing",
    steps: [
      { action: "Acknowledge concern" },
      { action: "Propose alternative time" },
      { action: "Schedule follow‑up" },
    ],
  },
];
