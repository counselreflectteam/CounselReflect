export type LLMProvider = 'openai' | 'gemini' | 'claude' | 'huggingface';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface ModelsResponse {
  providers: Record<string, ModelInfo[]>;
  total_models: number;
}

export enum Role {
  Chatbot = 'Chatbot',
  Client = 'Client',
  System = 'System',
}

export interface Message {
  id: string;
  role: Role;
  content: string;
}

export interface TranscriptMessageSelection {
  /** The complete transcript as it was loaded, before any turns were excluded. */
  sourceMessages: Message[];
  /** Source-message ids excluded from the evaluation subset. */
  excludedMessageIds: string[];
}

export interface Conversation {
  id: string;
  title: string;
  /** The retained, contiguously indexed subset sent to evaluation services. */
  messages: Message[];
  /** Tab-scoped draft state that makes transcript exclusions reversible. */
  messageSelection?: TranscriptMessageSelection;
}

export type MetricCategory = 'Empathy' | 'Safety' | 'Communication' | 'Emotion' | 'Factuality' | 'Custom' | 'Literature';

/**
 * CustomizedMetric - User-created metrics for evaluation
 * These are defined by the user in the "Customized Metrics" tab
 */
export interface CustomizedMetric {
  id: string;
  name: string;
  category: MetricCategory;
  description: string;
  definition: string; // The prompt/definition used for LLM evaluation
  type: 'categorical' | 'numerical';
  options?: string[]; // For categorical metrics (e.g., ["Low", "Medium", "High"])
  range?: [number, number]; // For numerical metrics (e.g., [1, 5])
  source?: string;
  target?: TargetSpeaker; // Which speaker's turns to evaluate
  allowNotApplicable?: boolean; // Whether an inapplicable turn may be reported as N/A
}

// Aligned with repomix/web/custom_types.py
export interface CategoricalScore {
  type: 'categorical';
  label: string;
  confidence?: number;
  highlighted_text?: string;
  metadata?: any;
}

export interface NumericalScore {
  type: 'numerical';
  value: number;
  max_value: number;
  label?: string;
  direction?: 'higher_is_better' | 'lower_is_better';
  highlighted_text?: string;
  metadata?: any;
}

export type MetricScore = CategoricalScore | NumericalScore;

export interface UtteranceScore {
  messageId: string;
  metrics: Record<string, MetricScore>;
  reasoning: Record<string, string>;
}

// Details for conversation-level metrics (like fact_score)
export interface ConversationMetricDetails {
  score: MetricScore;
  details?: any[];  // Additional details like per-fact breakdown
  latency_ms?: number;
  [key: string]: any;  // Allow additional fields
}

export interface EvaluationResult {
  timestamp: number;
  // Overall scores are normalized to a simple number for the radar chart,
  // but we might want rich objects in the future. For now, keeping simple map for chart.
  overallScores: Record<string, number>;
  /** For categorical metrics: most frequent label (e.g. "Low", "Medium"). Use for display when present. */
  overallLabels?: Record<string, string>;
  utteranceScores: UtteranceScore[];
  // Conversation-level metric details (for metrics that don't have per-utterance scores)
  conversationMetrics?: Record<string, ConversationMetricDetails>;
  session_id?: string;
  rawResults?: any;
  /** Per-metric failure reasons (metric name → backend error message) for metrics that failed during evaluation. */
  metricErrors?: Record<string, string>;
}

export enum EvaluationStatus {
  Idle = 'Idle',
  Loading = 'Loading',
  Complete = 'Complete',
  Error = 'Error'
}

/**
 * PredefinedMetric - Pre-trained metrics fetched from the backend
 * These are displayed in the "Predefined Metrics" tab
 */
export type TargetSpeaker = 'therapist' | 'patient' | 'both';

export interface MetricReference {
  shortApa?: string;
  title?: string;
  citation?: string;
  url?: string;
  modelName?: string;
  modelUrl?: string;
}

export interface PredefinedMetric {
    name: string;
    label: string;
    description: string;
    category: string;
    requiresHf?: boolean;
    target?: TargetSpeaker;
    reference?: MetricReference | string;
    outputDescription?: string;
    outputLabels?: string[];
    serverAvailable?: boolean | null;
    availabilityNote?: string | null;
}

export interface PredefinedMetricResponse {
    metrics: PredefinedMetric[];
    total: number;
    by_category: Record<string, string[]>;
}

export type MetricOutputKind =
  | 'ordinal'
  | 'categorical'
  | 'numerical'
  | 'multichannel'
  | 'span'
  | 'unknown';

/**
 * Stable, serializable presentation metadata captured with an evaluation run.
 * Host-page score inspectors must explain the metric that actually ran rather
 * than relying on whatever happens to be selected after a refresh.
 */
export interface MetricPresentationSnapshot {
  id: string;
  parentId?: string;
  label: string;
  shortDefinition: string;
  definition?: string;
  whyItMatters?: string;
  sourceType: 'predefined' | 'literature' | 'custom';
  target?: TargetSpeaker;
  outputKind: MetricOutputKind;
  scaleLabel?: string;
  outputLabels?: string[];
  direction?: 'higher_is_better' | 'lower_is_better';
  confidenceMeaning?: string;
  caution?: string;
  anchors?: Array<{ label: string; description: string }>;
  sourceLabel?: string;
  sourceUrl?: string;
}

export interface ApiKeys extends Record<string, string | undefined> {
  openai?: string;
  gemini?: string;
  claude?: string;
  hf?: string;
}

export interface ProviderConfig {
  provider: LLMProvider;
  model: string;
}
