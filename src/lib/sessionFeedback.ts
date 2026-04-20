/**
 * sessionFeedback.ts — Post-session analysis for AI training roleplay.
 *
 * Analyses the full conversation transcript and generates structured feedback:
 *  - strengths: what the rep did well
 *  - weaknesses: areas for improvement
 *  - missedOpportunities: specific moments where the rep could have acted differently
 *
 * All analysis is rule-based (no LLM) — uses pattern matching on the conversation.
 * Output is in a conversational, coaching tone — not robotic.
 */

import type { TrainingScenario } from "../data/knowledgeStructured";
import type { ConversationMemory } from "./personalityEngine";

interface Message {
  role: "user" | "ai";
  text: string;
  timestamp: number;
}

export interface SessionFeedback {
  strengths: string[];
  weaknesses: string[];
  missedOpportunities: string[];
  overallScore: number; // 0–100
  /** Conversational coaching summary — human tone, specific moments */
  coachingSummary: string;
}

// ── Analysis Engine ─────────────────────────────────────────────────────────

/**
 * Analyses a full session transcript and returns structured feedback.
 */
export function analyseSession(
  messages: Message[],
  scenario: TrainingScenario | null,
  finalScore: { objectionHandling: number; questioning: number; closing: number; total: number },
  memory?: ConversationMemory,
): SessionFeedback {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const missedOpportunities: string[] = [];

  const userMessages = messages.filter((m) => m.role === "user");
  const aiMessages = messages.filter((m) => m.role === "ai");
  const totalExchanges = userMessages.length;

  // ── Strength Detection ──────────────────────────────────────────────────

  // Questioning — user asked questions
  const questionCount = userMessages.filter((m) => m.text.includes("?")).length;
  if (questionCount >= 2) {
    strengths.push(`Asked ${questionCount} questions — good discovery approach`);
  }

  // Acknowledging concerns
  const acknowledgements = userMessages.filter(
    (m) =>
      m.text.toLowerCase().includes("understand") ||
      m.text.toLowerCase().includes("fair point") ||
      m.text.toLowerCase().includes("i hear you") ||
      m.text.toLowerCase().includes("that makes sense"),
  ).length;
  if (acknowledgements >= 1) {
    strengths.push(`Acknowledged client concerns ${acknowledgements} time${acknowledgements > 1 ? "s" : ""}`);
  }

  // Substantive responses (>40 chars)
  const substantiveResponses = userMessages.filter((m) => m.text.length > 40).length;
  if (substantiveResponses >= 2) {
    strengths.push("Provided detailed, substantive responses");
  }

  // Score-based strengths
  if (finalScore.objectionHandling >= 7) {
    strengths.push("Strong objection handling");
  }
  if (finalScore.questioning >= 7) {
    strengths.push("Effective questioning technique");
  }
  if (finalScore.closing >= 7) {
    strengths.push("Confident closing approach");
  }

  // ── Weakness Detection ──────────────────────────────────────────────────

  // Very short responses (<12 chars)
  const shortResponses = userMessages.filter((m) => m.text.length < 12 && m.text.length > 0).length;
  if (shortResponses >= 2) {
    weaknesses.push(`${shortResponses} very brief responses — try to elaborate more`);
  }

  // No questions asked
  if (questionCount === 0 && totalExchanges >= 3) {
    weaknesses.push("No questions asked during the conversation — discovery is key");
  }

  // Never acknowledged concerns
  if (acknowledgements === 0 && totalExchanges >= 2) {
    weaknesses.push("Didn't acknowledge client concerns — this builds rapport");
  }

  // Low objection handling score
  if (finalScore.objectionHandling < 4) {
    weaknesses.push("Objection handling needs improvement — practice addressing concerns directly");
  }

  // Low closing score
  if (finalScore.closing < 3) {
    weaknesses.push("Didn't attempt to close — look for commitment signals");
  }

  // ── Missed Opportunity Detection ────────────────────────────────────────

  // AI expressed concern but user didn't address it
  for (let i = 0; i < aiMessages.length; i++) {
    const aiMsg = aiMessages[i];
    const textLower = aiMsg.text.toLowerCase();
    if (
      textLower.includes("not sure") ||
      textLower.includes("worried") ||
      textLower.includes("concern") ||
      textLower.includes("risk")
    ) {
      // Check if next user message addressed it
      const nextUserIdx = userMessages.findIndex((m) => m.timestamp > aiMsg.timestamp);
      if (nextUserIdx >= 0) {
        const userResponse = userMessages[nextUserIdx].text.toLowerCase();
        if (
          !userResponse.includes("understand") &&
          !userResponse.includes("concern") &&
          !userResponse.includes("happy to") &&
          !userResponse.includes("let me") &&
          !userResponse.includes("?")
        ) {
          missedOpportunities.push(`Client expressed uncertainty — could have probed further instead of moving on`);
        }
      }
    }
  }

  // No value proposition mentioned
  const allUserText = userMessages.map((m) => m.text.toLowerCase()).join(" ");
  if (
    !allUserText.includes("save") &&
    !allUserText.includes("worth") &&
    !allUserText.includes("benefit") &&
    !allUserText.includes("value")
  ) {
    missedOpportunities.push("Didn't communicate value or benefits — always connect to client outcomes");
  }

  // No urgency created
  if (
    !allUserText.includes("now") &&
    !allUserText.includes("time") &&
    !allUserText.includes("window") &&
    !allUserText.includes("opportunity")
  ) {
    if (totalExchanges >= 4) {
      missedOpportunities.push("No sense of urgency created — consider timing and market factors");
    }
  }

  // Didn't ask about goals
  if (
    !allUserText.includes("goal") &&
    !allUserText.includes("want") &&
    !allUserText.includes("looking") &&
    !allUserText.includes("hoping")
  ) {
    if (totalExchanges >= 3) {
      missedOpportunities.push("Didn't explore client's goals — understanding their 'why' is critical");
    }
  }

  // Didn't attempt to close
  const closingAttempts = userMessages.filter(
    (m) =>
      m.text.toLowerCase().includes("shall we") ||
      m.text.toLowerCase().includes("ready to") ||
      m.text.toLowerCase().includes("next step") ||
      m.text.toLowerCase().includes("move forward") ||
      m.text.toLowerCase().includes("lock in") ||
      m.text.toLowerCase().includes("book"),
  ).length;
  if (closingAttempts === 0 && totalExchanges >= 4) {
    missedOpportunities.push("No closing attempt — always ask for commitment when the moment is right");
  }

  // Ensure at least one item in each category
  if (strengths.length === 0) strengths.push("Completed the session — practice makes perfect");
  if (weaknesses.length === 0) weaknesses.push("Room for refinement — keep practising");
  if (missedOpportunities.length === 0) missedOpportunities.push("No major missed opportunities detected");

  // Calculate overall score
  const scoreWeights = {
    strengths: 30,
    weaknesses: -20,
    missedOpportunities: -15,
    baseScore: finalScore.total,
  };

  let overallScore = scoreWeights.baseScore;
  overallScore += strengths.length * 5;
  overallScore -= weaknesses.length * 5;
  overallScore -= missedOpportunities.length * 3;
  overallScore = Math.max(0, Math.min(100, overallScore));

  // ── Generate conversational coaching summary ────────────────────────────
  const coachingSummary = generateCoachingSummary(
    messages,
    strengths,
    weaknesses,
    missedOpportunities,
    overallScore,
    memory,
  );

  return { strengths, weaknesses, missedOpportunities, overallScore, coachingSummary };
}

// ── Coaching Summary Generator ───────────────────────────────────────────────

/**
 * Generates a human, conversational coaching summary.
 * References specific moments from the conversation rather than generic feedback.
 */
function generateCoachingSummary(
  messages: Message[],
  strengths: string[],
  weaknesses: string[],
  missedOpportunities: string[],
  overallScore: number,
  memory?: ConversationMemory,
): string {
  const userMessages = messages.filter((m) => m.role === "user");
  const aiMessages = messages.filter((m) => m.role === "ai");
  const totalExchanges = userMessages.length;

  if (totalExchanges === 0) return "No conversation to analyse.";

  const paragraphs: string[] = [];

  // Opening — overall impression
  if (overallScore >= 70) {
    paragraphs.push("Solid session. You held your ground and moved the conversation forward well.");
  } else if (overallScore >= 40) {
    paragraphs.push("Decent effort, but there are a few areas that cost you momentum.");
  } else {
    paragraphs.push("Tough session — you lost control of the conversation pretty early.");
  }

  // Specific moment — what went wrong or right
  if (aiMessages.length > 0) {
    const firstAiObjection = aiMessages.findIndex(
      (m) =>
        m.text.toLowerCase().includes("not sure") ||
        m.text.toLowerCase().includes("concern") ||
        m.text.toLowerCase().includes("worried"),
    );
    if (firstAiObjection >= 0 && userMessages[firstAiObjection]) {
      const repResponse = userMessages[firstAiObjection]?.text || "";
      if (repResponse.length < 20) {
        paragraphs.push(
          `You lost them around exchange ${firstAiObjection + 1}. The client raised a concern and your response was too brief — they needed reassurance, not a quick answer.`,
        );
      } else if (
        !repResponse.toLowerCase().includes("understand") &&
        !repResponse.toLowerCase().includes("fair") &&
        !repResponse.toLowerCase().includes("good point")
      ) {
        paragraphs.push(
          `When the client pushed back on exchange ${firstAiObjection + 1}, you jumped straight into your pitch instead of acknowledging their concern first. That's a common mistake — try "I hear you" before your response.`,
        );
      }
    }
  }

  // Memory-based feedback
  if (memory) {
    if (memory.concernsUnanswered.length > 0) {
      paragraphs.push(
        `You left ${memory.concernsUnanswered.length} concern${memory.concernsUnanswered.length > 1 ? "s" : ""} unaddressed — the client will remember that, and it'll come back on the next call.`,
      );
    }
    if (memory.repPromises.length > 0 && memory.repPromises.length <= 2) {
      paragraphs.push(
        `You made ${memory.repPromises.length} promise${memory.repPromises.length > 1 ? "s" : ""} — make sure you follow through. Consistency builds trust.`,
      );
    }
  }

  // Strength highlight
  if (strengths.length > 0) {
    paragraphs.push(`What worked well: ${strengths[0].toLowerCase()}. Keep doing that.`);
  }

  // Actionable close
  if (weaknesses.length > 0) {
    paragraphs.push(`Next time, focus on this: ${weaknesses[0].toLowerCase()}. One thing at a time.`);
  } else if (missedOpportunities.length > 0) {
    paragraphs.push(`One thing to add next session: ${missedOpportunities[0].toLowerCase()}.`);
  }

  return paragraphs.join(" ");
}
