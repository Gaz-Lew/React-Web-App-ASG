/**
 * personalityEngine.ts — Drives AI persona behaviour in training scenarios.
 *
 * The personality engine modifies AI responses to feel like a real human:
 *  - Personality type (analytical, skeptical, friendly, busy)
 *  - Traits (riskAverse, priceSensitive, talkative)
 *  - Emotional state (trust, interest, resistance) that evolves during the conversation
 *  - Imperfection injection for natural-feeling responses
 *  - Personality drift based on emotional state
 *  - Response delays for natural feel
 *  - Interruption handling
 */

import type { ScenarioPersonality } from "../data/knowledgeStructured";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmotionalState {
  trust: number; // 0–100
  interest: number; // 0–100
  resistance: number; // 0–100
}

export interface PersonalityContext {
  personality: ScenarioPersonality;
  emotionalState: EmotionalState;
  exchangeCount: number;
  lastUserMessage: string;
}

/**
 * Conversation memory — tracks what's been raised and whether concerns were addressed.
 * Updated after each exchange.
 */
export interface ConversationMemory {
  objectionsRaised: string[];
  concernsUnanswered: string[];
  repPromises: string[];
  topicsCovered: string[];
  repContradictions: number;
}

/** Creates an empty conversation memory */
export function createEmptyMemory(): ConversationMemory {
  return {
    objectionsRaised: [],
    concernsUnanswered: [],
    repPromises: [],
    topicsCovered: [],
    repContradictions: 0,
  };
}

/**
 * Updates conversation memory after an exchange.
 * Detects unanswered concerns, new objections, and rep promises.
 */
export function updateMemory(
  memory: ConversationMemory,
  aiMessage: string,
  userMessage: string,
  emotionalState: EmotionalState,
): ConversationMemory {
  const updated = { ...memory };
  const aiLower = aiMessage.toLowerCase();
  const userLower = userMessage.toLowerCase();

  // Detect if AI raised an objection/concern
  const objectionKeywords = [
    "not sure",
    "worried",
    "concern",
    "risk",
    "expensive",
    "too much",
    "compare",
    "think about",
    "need time",
    "already have",
    "don't know",
  ];
  for (const kw of objectionKeywords) {
    if (aiLower.includes(kw) && !updated.objectionsRaised.some((o) => o.includes(kw))) {
      const snippet = aiMessage.substring(Math.max(0, aiLower.indexOf(kw) - 10), aiLower.indexOf(kw) + 40);
      updated.objectionsRaised.push(snippet.trim());
      updated.concernsUnanswered.push(kw); // starts as unanswered
      break;
    }
  }

  // Detect if user addressed a concern
  const acknowledgmentKeywords = [
    "understand",
    "address that",
    "good point",
    "valid",
    "makes sense",
    "hear you",
    "fair",
    "absolutely",
    "exactly",
  ];
  for (const kw of acknowledgmentKeywords) {
    if (userLower.includes(kw)) {
      // Mark last unanswered concern as answered
      if (updated.concernsUnanswered.length > 0) {
        updated.concernsUnanswered.pop();
      }
      break;
    }
  }

  // Detect rep promises (future-tense commitments)
  const promiseKeywords = [
    "i'll",
    "we'll",
    "i will",
    "we will",
    "i can",
    "let me",
    "send you",
    "show you",
    "get back",
    "follow up",
  ];
  for (const kw of promiseKeywords) {
    if (userLower.includes(kw)) {
      const idx = userLower.indexOf(kw);
      const snippet = userMessage.substring(Math.max(0, idx - 5), idx + 40);
      updated.repPromises.push(snippet.trim());
      break;
    }
  }

  // Track topics covered
  const topicKeywords = [
    "smsf",
    "super",
    "fee",
    "cost",
    "rate",
    "property",
    "investment",
    "strategy",
    "approach",
    "timeline",
    "settlement",
    "refinance",
  ];
  for (const kw of topicKeywords) {
    if ((userLower.includes(kw) || aiLower.includes(kw)) && !updated.topicsCovered.includes(kw)) {
      updated.topicsCovered.push(kw);
    }
  }

  // If concerns remain unanswered, increase resistance impact
  if (updated.concernsUnanswered.length >= 3) {
    emotionalState.resistance = Math.min(100, emotionalState.resistance + 5);
  }

  return updated;
}

// ── Emotional State Engine ───────────────────────────────────────────────────

/** Create initial emotional state based on personality type */
export function createInitialEmotionalState(personality: ScenarioPersonality): EmotionalState {
  const base: Record<string, EmotionalState> = {
    analytical: { trust: 40, interest: 60, resistance: 30 },
    skeptical: { trust: 20, interest: 40, resistance: 60 },
    friendly: { trust: 60, interest: 50, resistance: 20 },
    busy: { trust: 40, interest: 30, resistance: 40 },
  };
  return base[personality.type] || { trust: 40, interest: 50, resistance: 30 };
}

/**
 * Update emotional state based on user's message quality and approach.
 * Returns the updated state.
 */
export function updateEmotionalState(
  state: EmotionalState,
  personality: ScenarioPersonality,
  userMessage: string,
  exchangeCount: number,
): EmotionalState {
  const updated = { ...state };
  const lower = userMessage.toLowerCase();

  // ── Trust changes ─────────────────────────────────────────────────────
  // Increases when user acknowledges concerns, asks good questions, provides specifics
  if (lower.includes("understand") || lower.includes("fair point") || lower.includes("i hear you")) {
    updated.trust = Math.min(100, updated.trust + 8);
  }

  if (lower.includes("?")) {
    updated.trust = Math.min(100, updated.trust + 3); // asking questions builds trust
  }

  if (lower.length > 50) {
    updated.trust = Math.min(100, updated.trust + 2); // thoughtful responses
  }

  // Pushy language damages trust
  if (lower.includes("you must") || lower.includes("you need to") || lower.includes("right now")) {
    updated.trust = Math.max(0, updated.trust - 10);
  }

  // Vague answers reduce trust slowly
  if (lower.length < 15) {
    updated.trust = Math.max(0, updated.trust - 3);
  }

  // ── Interest changes ───────────────────────────────────────────────────
  // Increases with relevant content, value propositions, specific data
  if (lower.includes("save") || lower.includes("benefit") || lower.includes("worth") || lower.includes("value")) {
    updated.interest = Math.min(100, updated.interest + 6);
  }

  if (lower.includes("strategy") || lower.includes("approach") || lower.includes("plan")) {
    updated.interest = Math.min(100, updated.interest + 4);
  }

  // Price sensitivity trait — interest drops if costs discussed without value
  if (personality.traits.priceSensitive && lower.includes("fee") && !lower.includes("worth")) {
    updated.interest = Math.max(0, updated.interest - 8);
  }

  // Risk aversion trait — interest drops if risk not addressed
  if (
    personality.traits.riskAverse &&
    !lower.includes("safe") &&
    !lower.includes("control") &&
    !lower.includes("protect")
  ) {
    if (exchangeCount > 3) {
      updated.interest = Math.max(0, updated.interest - 3);
    }
  }

  // ── Resistance changes ─────────────────────────────────────────────────
  // Decreases when trust and interest are building
  if (updated.trust > 50 && updated.interest > 50) {
    updated.resistance = Math.max(0, updated.resistance - 5);
  }

  // Increases with pushiness, vagueness, or ignoring concerns
  if (lower.includes("you must") || lower.includes("you have to")) {
    updated.resistance = Math.min(100, updated.resistance + 12);
  }

  if ((lower.includes("just") && lower.includes("sign")) || (lower.includes("just") && lower.includes("agree"))) {
    updated.resistance = Math.min(100, updated.resistance + 10);
  }

  // If user ignores stated concerns, resistance builds
  if (lower.length < 20 && exchangeCount > 2) {
    updated.resistance = Math.min(100, updated.resistance + 4);
  }

  // Time pressure increases resistance for non-busy types
  if (personality.type !== "busy" && (lower.includes("urg") || lower.includes("now") || lower.includes("today"))) {
    if (updated.trust < 40) {
      updated.resistance = Math.min(100, updated.resistance + 6);
    }
  }

  // Natural decay — resistance slowly drops over time if nothing negative happens
  if (exchangeCount > 2) {
    updated.resistance = Math.max(0, updated.resistance - 1);
  }

  return updated;
}

// ── Response Style Engine ────────────────────────────────────────────────────

/**
 * Generates a response modifier based on current emotional state and personality.
 * This influences the tone, length, and content of the AI's response.
 */
export function getResponseModifier(context: PersonalityContext): {
  tone: string;
  length: "short" | "medium";
  deflection: boolean;
  questioning: boolean;
  agreement: boolean;
} {
  const { personality, emotionalState } = context;
  const { trust, interest, resistance } = emotionalState;

  const modifier: {
    tone: string;
    length: "short" | "medium";
    deflection: boolean;
    questioning: boolean;
    agreement: boolean;
  } = {
    tone: "neutral",
    length: "short",
    deflection: false,
    questioning: false,
    agreement: false,
  };

  // Tone based on resistance + personality
  if (resistance > 60) {
    modifier.tone = personality.type === "friendly" ? "polite-but-firm" : "resistant";
    modifier.deflection = true;
  } else if (resistance > 40) {
    modifier.tone = "cautious";
    modifier.questioning = true;
  } else if (trust > 60 && interest > 50) {
    modifier.tone = "engaged";
    modifier.agreement = true;
    modifier.length = "medium";
  } else if (interest > 60) {
    modifier.tone = "curious";
    modifier.questioning = true;
    modifier.length = "medium";
  }

  // Personality-specific adjustments
  if (personality.type === "busy") {
    modifier.length = "short";
    if (resistance > 50) {
      modifier.tone = "impatient";
    }
  }

  if (personality.type === "analytical") {
    if (interest > 50) {
      modifier.length = "medium";
      modifier.questioning = true;
    }
  }

  if (personality.type === "skeptical") {
    modifier.questioning = true; // always probing
    if (trust < 30) {
      modifier.deflection = true;
    }
  }

  if (personality.type === "friendly" && trust > 70) {
    modifier.agreement = true;
  }

  return modifier;
}

// ── Natural Flow Controls ────────────────────────────────────────────────────

/** Random delay between 400–1200ms to simulate natural thinking */
export function getNaturalResponseDelay(): number {
  return 400 + Math.random() * 800;
}

/** Whether the user's message is interruptible (AI is still 'thinking') */
export function isInterruptible(): boolean {
  // In a real system this would check TTS state
  // For text-based roleplay, always interruptible
  return true;
}

// ── Personality Response Adaptor ─────────────────────────────────────────────

/**
 * Takes a base response from the scenario engine and adapts it to the personality.
 */
export function adaptResponseToPersonality(
  baseResponse: string,
  personality: ScenarioPersonality,
  emotionalState: EmotionalState,
): string {
  // If resistance is very high, the response may be shorter and more dismissive
  if (emotionalState.resistance > 70) {
    const cutShort = [
      "I'm not sure about that.",
      "I'd need to think about it.",
      "That doesn't really address my concern.",
      "I appreciate that but I'm still not convinced.",
    ];
    if (Math.random() > 0.5) {
      return cutShort[Math.floor(Math.random() * cutShort.length)];
    }
  }

  // Analytical types ask more questions
  if (personality.type === "analytical" && emotionalState.interest > 40) {
    const questions = [
      "Can you explain how that works in more detail?",
      "What's the evidence for that?",
      "How does that compare to the alternatives?",
    ];
    if (Math.random() > 0.6) {
      return baseResponse + " " + questions[Math.floor(Math.random() * questions.length)];
    }
  }

  // Busy types keep it short
  if (personality.type === "busy") {
    if (baseResponse.length > 80) {
      return baseResponse.substring(0, 80) + "...";
    }
  }

  // Friendly types soften their language
  if (personality.type === "friendly" && emotionalState.trust > 50) {
    const softeners = ["That sounds good actually.", "I can see where you're coming from.", "That's interesting."];
    if (Math.random() > 0.5) {
      return softeners[Math.floor(Math.random() * softeners.length)] + " " + baseResponse;
    }
  }

  return baseResponse;
}

// ── Imperfection Engine ──────────────────────────────────────────────────────

/**
 * Injects natural imperfections into AI responses to make them feel more human.
 *  - 20% chance of short/dismissive response
 *  - 20% chance of interruption style ("Yeah but…")
 *  - 15% chance of vague uncertainty
 *  - Otherwise returns original response
 */
export function injectImperfection(
  response: string,
  personality: ScenarioPersonality,
  emotionalState: EmotionalState,
): string {
  const roll = Math.random();

  // High resistance → more dismissive
  if (emotionalState.resistance > 70 && roll < 0.3) {
    const dismissive = [
      "Yeah, I've heard that before.",
      "That's what they all say.",
      "I'm not really convinced.",
      "Right. Anyway…",
      "Mm-hmm.",
    ];
    return dismissive[Math.floor(Math.random() * dismissive.length)];
  }

  // 20% interruption style
  if (roll < 0.2) {
    const interruptions = [
      "Yeah but that's not really my concern.",
      "Hang on — that's not what I asked.",
      "Wait, I'm still not clear on something.",
      "Yeah but what about the cost?",
      "Hold on — I need to understand this better first.",
    ];
    return interruptions[Math.floor(Math.random() * interruptions.length)];
  }

  // 15% vague uncertainty
  if (roll < 0.35) {
    const vague = [
      "I guess that makes sense… I think.",
      "Maybe. I'd need to think about it.",
      "I suppose so… but I'm still unsure.",
      "Right… I think?",
      "Okay… but I don't know.",
    ];
    return vague[Math.floor(Math.random() * vague.length)];
  }

  // Personality-specific imperfections
  if (personality.type === "skeptical" && roll < 0.5) {
    const skepticalAdditions = [
      response + " — if that's actually true.",
      response + " — I suppose.",
      "So you're saying… " + response.charAt(0).toLowerCase() + response.slice(1),
    ];
    return skepticalAdditions[Math.floor(Math.random() * skepticalAdditions.length)];
  }

  if (personality.type === "busy" && roll < 0.5) {
    return response.length > 60 ? response.substring(0, 60) + "…" : response;
  }

  return response;
}

// ── Personality Drift ────────────────────────────────────────────────────────

/**
 * Adapts the personality's response style based on current emotional state.
 * Trust > 70 → more open, warmer tone
 * Resistance > 70 → more defensive, shorter responses
 */
export function applyPersonalityDrift(
  response: string,
  _personality: ScenarioPersonality,
  emotionalState: EmotionalState,
): string {
  // High trust → warmer, more open tone
  if (emotionalState.trust > 70) {
    const warmers = [
      "Actually, " + response.charAt(0).toLowerCase() + response.slice(1),
      response + " — I appreciate you explaining that.",
      response + " That's helpful, thanks.",
    ];
    if (Math.random() > 0.5) {
      return warmers[Math.floor(Math.random() * warmers.length)];
    }
  }

  // High resistance → more defensive, shorter
  if (emotionalState.resistance > 70) {
    if (response.length > 50) {
      const cutOff = response.indexOf(",", 30);
      if (cutOff > 0) {
        return response.substring(0, cutOff) + ".";
      }
      return response.substring(0, 40) + "…";
    }
    // Add defensive prefix
    const defensive = [
      "I don't know about that. " + response,
      "Maybe. But " + response.charAt(0).toLowerCase() + response.slice(1),
      response + " — that's what I'm worried about.",
    ];
    if (Math.random() > 0.4) {
      return defensive[Math.floor(Math.random() * defensive.length)];
    }
  }

  // Medium trust, medium resistance → natural drift
  if (emotionalState.trust > 40 && emotionalState.trust <= 60) {
    if (Math.random() > 0.7) {
      return response.charAt(0).toUpperCase() + response.slice(1);
    }
  }

  return response;
}
