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
  Therapist = 'Therapist',
  Client = 'Client',
  System = 'System',
}

export interface Message {
  id: string;
  role: Role;
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

export type MetricCategory = 'Empathy' | 'Safety' | 'Communication' | 'Emotion' | 'Custom' | 'Literature';

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
}

export interface PredefinedMetric {
    name: string;
    label: string;
    description: string;
    category: string;
    requiresHf?: boolean;
    target?: TargetSpeaker;
    reference?: MetricReference | string;
}

export interface PredefinedMetricResponse {
    metrics: PredefinedMetric[];
    total: number;
    by_category: Record<string, string[]>;
}

export interface ApiKeys {
  openai?: string;
  gemini?: string;
  claude?: string;
  hf?: string;
}

export interface ProviderConfig {
  provider: LLMProvider;
  model: string;
}
