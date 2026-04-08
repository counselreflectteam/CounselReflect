import type { CustomizedMetric } from '../types';

export const PREDEFINED_METRICS: CustomizedMetric[] = [
  // EMPATHY CATEGORY (Categorical: Low/Medium/High)
  {
    id: 'empathy_er',
    name: 'Empathy ER',
    category: 'Empathy',
    description: 'Emotional Reaction: Recognizing and reflecting implicit emotions.',
    definition: 'Classify the Emotional Reflection (ER) as Low, Medium, or High. Low: No recognition of emotion. Medium: Explicit recognition. High: Deep, implicit reflection of underlying emotional state.',
    type: 'categorical',
    options: ['Low', 'Medium', 'High']
  },
  {
    id: 'empathy_ip',
    name: 'Empathy IP',
    category: 'Empathy',
    description: 'Interpretation: Offering psychological connections or insights.',
    definition: 'Classify Interpretation (IP) as Low, Medium, or High. Low: No interpretation. Medium: Basic connection. High: Insightful reframing or connection of disparate elements.',
    type: 'categorical',
    options: ['Low', 'Medium', 'High']
  },
  {
    id: 'empathy_ex',
    name: 'Empathy EX',
    category: 'Empathy',
    description: 'Exploration: Facilitating deeper elaboration of experiences.',
    definition: 'Classify Exploration (EX) as Low, Medium, or High. Low: Closed questions/no exploration. Medium: Open questions. High: Facilitates deep elaboration of feelings/thoughts.',
    type: 'categorical',
    options: ['Low', 'Medium', 'High']
  },

  // SAFETY QUALITY CATEGORY (Categorical)
  {
    id: 'toxicity',
    name: 'Toxicity',
    category: 'Safety',
    description: 'Presence of toxic content.',
    definition: 'Detect if the utterance is Toxic or Safe. If Toxic, specify category.',
    type: 'categorical',
    options: ['Safe', 'Toxic']
  },
  {
    id: 'fact_score',
    name: 'Fact Score',
    category: 'Factuality',
    description: 'Verifies factual accuracy using atomic fact decomposition and web search (OpenFactScore).',
    definition: 'Score 0-1 indicating proportion of verifiable facts supported by web evidence.',
    type: 'numerical',
    range: [0, 1]
  },

  // COMMUNICATION CATEGORY
  {
    id: 'talk_type',
    name: 'Talk Type',
    category: 'Communication',
    description: 'Classification of patient speech: Change, Sustain, or Neutral.',
    definition: 'Classify the patient utterance as: "Change" (movement toward goal), "Sustain" (arguing against change), or "Neutral".',
    type: 'categorical',
    options: ['Change', 'Sustain', 'Neutral']
  },
  {
    id: 'active_listening',
    name: 'Active Listening',
    category: 'Communication',
    description: 'Demonstration of attention via validation and summarization.',
    definition: 'Rate Active Listening 1-5. 1: Ignored. 3: Basic Acknowledgement. 5: Accurate Summary/Validation.',
    type: 'numerical',
    range: [1, 5]
  },

  // EMOTION CATEGORY
  {
    id: 'emotion_analysis',
    name: 'Emotion Analysis',
    category: 'Emotion',
    description: 'Dominant emotional valence and intensity.',
    definition: 'Identify the primary emotion (e.g., Sadness, Joy, Fear, Anger, Neutral) and its intensity (0-1).',
    type: 'categorical',
    options: ['Neutral', 'Joy', 'Sadness', 'Fear', 'Anger']
  },
  {
    id: 'emo_stat',
    name: 'Emotional Support Strategy',
    category: 'Communication',
    description: 'Classifies emotional support strategies using ESConv-trained RoBERTa model.',
    definition: 'Classify the emotional support strategy based on the ESConv dataset (Liu et al., ACL 2021).',
    type: 'categorical',
    options: ['Affirmation and Reassurance', 'Information', 'Others', 'Providing Suggestions', 'Question', 'Reflection of feelings', 'Restatement or Paraphrasing', 'Self-disclosure']
  },
  {
    id: 'pair',
    name: 'PAIR Reflection Scorer',
    category: 'Communication',
    description: 'Scores counselor reflection quality in Motivational Interviewing.',
    definition: 'Score the quality of counselor reflections using PAIR (Prompt-Aware margIn Ranking) model.',
    type: 'numerical',
    range: [0, 1]
  },
  {
    id: 'reccon',
    name: 'Emotional Triggers (RECCON)',
    category: 'Communication',
    description: 'Extracts causal text spans for emotions using RECCON.',
    definition: 'Identify the emotion and extract the specific text span that triggered it.',
    type: 'categorical',
    options: ['Joy', 'Sadness', 'Anger', 'Fear', 'Surprise', 'Disgust', 'Neutral']
  }
];

export const LITERATURE_METRICS: CustomizedMetric[] = [
  {
    id: 'clinical_accuracy',
    name: 'Clinical Info Accuracy',
    category: 'Literature',
    description: 'Veracity of medical/psychological facts against established literature.',
    source: 'CES-LCC (Providing Helpful Information)',
    definition: 'Rate 1-5 on the factual correctness of clinical information provided. 1: Factually incorrect/Hallucination. 3: General/Common knowledge. 5: Highly accurate and specific to medical literature (e.g., correctly citing side effects, symptoms, or mechanisms).',
    type: 'numerical',
    range: [1, 5]
  },
  {
    id: 'guideline_adherence',
    name: 'Therapeutic Adherence',
    category: 'Literature',
    description: 'Alignment with established clinical practice guidelines (e.g., APA).',
    source: 'CAPE Framework (Therapeutic Orientation) & APA Guidelines',
    definition: 'Rate 1-5 on adherence to clinical guidelines for the presenting condition. 1: Contradicts guidelines (e.g., suggesting harmful unproven methods). 3: Acceptable but generic. 5: Strongly aligned with specific evidence-based interventions (e.g., Behavioral Activation for Depression).',
    type: 'numerical',
    range: [1, 5]
  },
  {
    id: 'crisis_safety',
    name: 'Crisis Safety & Protocol',
    category: 'Literature',
    description: 'Appropriateness of response to high-risk disclosures.',
    source: 'CAPE (Risk Evaluation) & C-SSRS Protocols',
    definition: 'Rate 1-5 on crisis management. 1: Dangerous/Missed risk. 3: Basic safety disclaimer. 5: Follows correct triage protocol (e.g., specific screening questions, concrete referral resources, no dismissal of harm).',
    type: 'numerical',
    range: [1, 5]
  }
];
