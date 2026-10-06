import type { ReaderProfile, TraditionalAnalysis } from "./types";

export const TRADITIONAL_SCHEMA = `{
  "title": "string",
  "executiveSummary": "string",
  "keyPoints": ["string"],
  "entitiesAndTopics": ["string"],
  "risksOrConcerns": ["string"],
  "openQuestions": ["string"],
  "documentTone": "string"
}`;

export const ADAPTIVE_SCHEMA = `{
  "cognitive": {
    "mentalModel": "string",
    "misconceptionsToAvoid": ["string"],
    "comprehensionChecks": ["string"],
    "complexityNote": "string"
  },
  "emotional": {
    "likelyReactions": ["string"],
    "supportiveFraming": "string",
    "stressTriggersInDoc": ["string"],
    "reassuranceWhereAppropriate": "string"
  },
  "personalizedActions": ["string"],
  "readingGuidance": "string",
  "disclaimer": "string"
}`;

export function buildTraditionalPrompt(documentText: string): string {
  return `You are a professional document analyst. Analyze ONLY the document below. Do not invent facts not supported by the text. If information is missing, say so in openQuestions.

Return valid JSON matching this schema (no markdown fences):
${TRADITIONAL_SCHEMA}

DOCUMENT:
---
${documentText}
---`;
}

export function buildAdaptivePrompt(
  documentText: string,
  profile: ReaderProfile,
  traditional: TraditionalAnalysis,
): string {
  const profileJson = JSON.stringify(profile, null, 2);
  const traditionalJson = JSON.stringify(traditional, null, 2);

  return `You are an adaptive reading coach and cognitive-emotional interpreter. Your job is NOT to repeat a generic chatbot summary. You tailor how the document lands for THIS reader.

Rules:
- Ground claims in the document; use the prior analysis as a anchor.
- "mentalState" is self-reported context for tone and pacing — never diagnose medical conditions.
- Match vocabulary and sentence length to ageBand and educationLevel.
- Respect preferences.verbosity, emotionSupport, and cognitiveLoad.
- For anxious or overwhelmed readers: calm tone, prioritize order, avoid alarmism unless the document truly requires urgency.
- For low_energy: lead with what matters most; short paragraphs.
- Include a brief disclaimer that this is not medical or legal advice.

Reader profile:
${profileJson}

Prior neutral analysis (JSON):
${traditionalJson}

Document excerpt (may be truncated):
---
${documentText.slice(0, 24_000)}
---

Return valid JSON matching this schema (no markdown fences). Merge disclaimer into the top-level "disclaimer" field:
${ADAPTIVE_SCHEMA}`;
}
