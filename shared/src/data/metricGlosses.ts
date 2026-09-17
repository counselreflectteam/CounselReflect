/**
 * Clinician-language one-line glosses for the model-scored (predefined)
 * metrics — shown on MetricListRow instead of the backend `description`
 * (which remains unchanged and is shown in full in the detail modal).
 *
 * Consumers fall back to `metric.description` when a key is absent:
 *   PREDEFINED_METRIC_GLOSSES[metric.name] ?? metric.description
 */
export const PREDEFINED_METRIC_GLOSSES: Record<string, string> = {
  empathy_er: "Does the chatbot react with warmth to the client's feelings?",
  empathy_ex: "Does the chatbot explore feelings the client hasn't named?",
  empathy_ip: "Does the chatbot convey understanding of the client's experience?",
  emotion: 'Identifies the emotion expressed in each turn',
  reccon: 'Finds what in the conversation triggered each emotion',
  emotional_support_strategy: 'Labels the support strategy behind each chatbot turn',
  pair: "Rates the quality of the chatbot's MI reflections",
  talk_type: 'Sorts client statements into change, sustain, or neutral talk',
  toxicity: 'Screens all turns for harmful or toxic language, without third-party services',
  perspective: "Screens for toxic language using Google's Perspective API",
  fact_score: 'Checks chatbot statements for factual accuracy',
  medscore: 'Verifies medical claims against a clinical textbook corpus',
};
