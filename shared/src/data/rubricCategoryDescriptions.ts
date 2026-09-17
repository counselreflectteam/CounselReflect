const RUBRIC_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Advanced Skills':
    'Psychodynamic, experiential, and integrative techniques.',
  'CBT Techniques':
    'Thought reframing, behavioral experiments, skills practice, and between-session tasks.',
  'Communication Skills':
    'Open questions, reflections, clarification, summaries, and language matching.',
  'Core Conditions':
    'Empathy, acceptance, authenticity, attunement, and respect.',
  'Crisis & Trauma':
    'Safety checks, stabilization, trauma-sensitive pacing, and collaborative planning.',
  'Emotion Processing':
    'Emotion identification, validation, tolerance, deepening, and expression.',
  'MI Techniques':
    'Autonomy support, affirmations, ambivalence exploration, and change talk.',
  'Mindfulness & Body':
    'Grounding, breathing, somatic awareness, mindful movement, and regulation.',
  'Relationship Repair':
    'Alliance strain, metacommunication, acknowledgement, apology, and reconnection.',
  'Session Management':
    'Agenda setting, goals, boundaries, time, participation, progress checks, and endings.',
  'Solution-Focused':
    'Scaling questions, exceptions, strengths, preferred futures, and concrete next steps.'
};

const RUBRIC_CATEGORY_NOTES: Record<string, string> = {
  'Advanced Skills': 'How the chatbot uses complex, integrative interventions.',
  'CBT Techniques': 'How thoughts, behaviors, and skills are linked to change.',
  'Communication Skills': 'How the chatbot listens, asks, clarifies, and reflects.',
  'Core Conditions': 'Whether empathy, acceptance, respect, and attunement are present.',
  'Crisis & Trauma': 'How immediate safety and trauma-sensitive stabilization are handled.',
  'Emotion Processing': 'How feelings are named, explored, tolerated, and processed.',
  'MI Techniques': 'How autonomy, ambivalence, strengths, and change talk are supported.',
  'Mindfulness & Body': 'How grounding, breath, movement, and body awareness are used.',
  'Relationship Repair': 'How strain is noticed and trust and collaboration are repaired.',
  'Session Management': 'How goals, boundaries, pacing, progress, and transitions are managed.',
  'Solution-Focused': 'How strengths and preferred futures become practical next steps.'
};

const FALLBACK_DESCRIPTION =
  'Brings together rubric-scored measures that share a related focus in therapeutic practice.';

export const getRubricCategoryDescription = (category: string): string =>
  RUBRIC_CATEGORY_DESCRIPTIONS[category] || FALLBACK_DESCRIPTION;

export const getRubricCategoryNote = (category: string): string =>
  RUBRIC_CATEGORY_NOTES[category] || 'What this group reviews in therapeutic practice.';
