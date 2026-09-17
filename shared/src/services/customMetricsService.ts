import { api, handleApiError, API_URL, withAccessHeaders, LLM_REQUEST_TIMEOUT_MS } from './apiClient';
import { transformStandardizedResponse, StandardizedEvaluationResponse } from './transformers/evaluationTransformer';
import { TargetSpeaker } from '../types';
import { readNdjsonStream, throwStreamRequestError } from './streamingUtils';

export interface MetricDefinitionResponse {
  name: string;
  description: string;
  scale: string;
  guidance: string;
  examples: string[];
  target: TargetSpeaker;
  allow_not_applicable?: boolean;
}

export interface RefineMetricsResponse {
  version: string;
  metrics: MetricDefinitionResponse[];
  notes: string;
  raw_notes: string;
}

export interface ExamplePayload {
  conversation: { role: string; content: string }[];
  dimensions: Record<string, string>;
  metrics_output?: Record<string, any>;
}

export interface UpdateExampleOutputsRequest {
  examples: ExamplePayload[];
  rubric: RefineMetricsResponse;
  feedback: string;
  api_key?: string;
  provider: string;
  model: string;
}

export interface UpdateRubricFromExamplesRequest {
  rubric: RefineMetricsResponse;
  example_outputs: Record<string, any>[];
  feedback: string;
  api_key?: string;
  provider: string;
  model: string;
}

export interface RescoreExamplesRequest {
  examples: ExamplePayload[];
  rubric: RefineMetricsResponse;
  api_key?: string;
  provider: string;
  model: string;
  user_preferences?: Record<string, any>;
}

export interface LockProfileRequest {
  rubric: RefineMetricsResponse;
  user_preferences: Record<string, any>;
  canonical_examples: ExamplePayload[];
  version?: string;
  openai_api_key?: string;
}

export interface LockProfileResponse {
  version: string;
  refined_metrics: RefineMetricsResponse;
  user_preferences: Record<string, any>;
  canonical_examples: ExamplePayload[];
}

export interface ExampleSourceEntry {
  source: string;
  topic: string;
}

export interface ListSourcesResponse {
  sources: ExampleSourceEntry[];
  grouped: Record<string, string[]>;
  total_sources: number;
  total_topics: number;
}

export interface ExampleSelectionEntry {
  source: string;
  topic: string;
  count: number;
}

export interface SelectFromSourcesRequest {
  selections: ExampleSelectionEntry[];
  seed?: number;
}

export interface SelectFromSourcesResponse {
  preview: Record<string, any>;
  examples: ExamplePayload[];
}

export interface ScoreWithProfileRequest {
  conversation: { role: string; content: string }[];
  profile: {
    version?: string;
    rubric: RefineMetricsResponse;
    user_preferences: Record<string, any>;
    canonical_examples: ExamplePayload[];
  };
  api_key?: string;
  provider: string;
  model: string;
  run_id?: string;
}

export interface CustomMetricsEvalRequest {
  conversation: { role: string; content: string }[];
  selectedMetricNames: string[];
  lockedProfile: {
    version: string;
    rubric: RefineMetricsResponse;
    userPreferences: Record<string, any>;
    canonicalExamples: ExamplePayload[];
  };
  apiKey?: string;
  provider: string;
  model: string;
  runId?: string;
}

export interface CustomMetricsEvalResult {
  timestamp: number;
  overallScores: Record<string, number>;
  utteranceScores: Array<{
    messageId: string;
    metrics: Record<string, any>;
    reasoning: Record<string, string>;
  }>;
}

// -----------------------------------------------------------------------------
// API Functions
// -----------------------------------------------------------------------------

/**
 * Refine raw notes into structured metrics with LLM.
 */
export const refineMetrics = async (
  rawNotes: string,
  feedback: string = '',
  provider: string,
  model: string,
  apiKey?: string,
  currentRefinedMetrics?: MetricDefinitionResponse[]
): Promise<RefineMetricsResponse> => {
  try {
    const payload: Record<string, any> = {
      raw_notes: rawNotes,
      api_key: apiKey,
      provider: provider,
      model: model,
      feedback: feedback
    };
    
    if (currentRefinedMetrics && currentRefinedMetrics.length > 0) {
      payload.current_refined_metrics = currentRefinedMetrics;
    }
    
    const response = await api.post<RefineMetricsResponse>('/customize_pipeline/refine_metrics', payload, { timeout: LLM_REQUEST_TIMEOUT_MS });
    return response.data;
  } catch (error) {
    // The rubric builder presents a contextual inline error and preserves the
    // user's draft. Avoid the generic global toast, which duplicates the
    // message and may expose backend details outside the builder.
    throw error;
  }
};

/**
 * Update example outputs based on rubric.
 */
export const updateExampleOutputs = async (payload: UpdateExampleOutputsRequest) => {
  try {
    const response = await api.post('/customize_pipeline/update_example_outputs', payload, { timeout: LLM_REQUEST_TIMEOUT_MS });
    return response.data.outputs;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Update rubric based on example outputs.
 */
export const updateRubricFromExamples = async (payload: UpdateRubricFromExamplesRequest): Promise<RefineMetricsResponse> => {
  try {
    const response = await api.post<RefineMetricsResponse>('/customize_pipeline/update_rubric_from_examples', payload, { timeout: LLM_REQUEST_TIMEOUT_MS });
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Rescore examples with updated rubric.
 */
export const rescoreExamples = async (payload: RescoreExamplesRequest) => {
  try {
    const response = await api.post('/customize_pipeline/rescore_examples', payload, { timeout: LLM_REQUEST_TIMEOUT_MS });
    return response.data.outputs;
  } catch (error) {
    // CustomizedMetricsConfig owns the user-facing sample scoring error.
    throw error;
  }
};

/**
 * Select examples from specific sources/topics.
 */
export const selectFromSources = async (payload: SelectFromSourcesRequest): Promise<SelectFromSourcesResponse> => {
  try {
    const response = await api.post<SelectFromSourcesResponse>('/customize_pipeline/select_from_sources', payload);
    return response.data;
  } catch (error) {
    // CustomizedMetricsConfig owns the user-facing sample loading error.
    throw error;
  }
};

/**
 * Score conversation with locked profile.
 */
export const scoreWithProfile = async (payload: ScoreWithProfileRequest, signal?: AbortSignal): Promise<Record<string, any>> => {
  try {
    const response = await api.post<Record<string, any>>('/customize_pipeline/score_with_profile', payload, { signal, timeout: LLM_REQUEST_TIMEOUT_MS });
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Build profile payload for custom metrics evaluation.
 * Filters rubric to selected metrics only.
 */
export function buildProfilePayload(
  request: CustomMetricsEvalRequest
): ScoreWithProfileRequest {
  const { conversation, selectedMetricNames, lockedProfile, apiKey, provider, model, runId } = request;
  const filteredMetrics = lockedProfile.rubric.metrics.filter(
    m => selectedMetricNames.includes(m.name)
  );
  const payload: ScoreWithProfileRequest = {
    conversation,
    profile: {
      version: lockedProfile.version,
      rubric: { ...lockedProfile.rubric, metrics: filteredMetrics },
      user_preferences: lockedProfile.userPreferences,
      canonical_examples: lockedProfile.canonicalExamples
    },
    provider,
    model,
    run_id: runId
  };
  if (apiKey) payload.api_key = apiKey;
  return payload;
}

export type CustomMetricsOnProgressCallback = (
  metric: string,
  result: any,
  completedCount: number,
  totalCount: number,
  errorReason?: string
) => void;

/**
 * Evaluate conversation using custom metrics via streaming endpoint.
 */
export const evaluateCustomMetricsStream = async (
  request: CustomMetricsEvalRequest,
  onProgress?: CustomMetricsOnProgressCallback,
  signal?: AbortSignal
): Promise<CustomMetricsEvalResult> => {
  const { conversation, selectedMetricNames } = request;
  const profilePayload = buildProfilePayload(request);

  try {
    const response = await fetch(`${API_URL}/customize_pipeline/score_with_profile/stream`, {
      method: 'POST',
      headers: withAccessHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(profilePayload),
      signal
    });

    if (!response.body) throw new Error("No response body");
    if (!response.ok) {
        await throwStreamRequestError(response, 'Custom stream');
    }

    const reader = response.body.getReader();

    // Accumulate results
    const accumulatedResults: Record<string, any> = {};
    let completedCount = 0;
    let totalCount = selectedMetricNames.length; 

    const processLine = (line: string) => {
      try {
        if (line.trim() === '') return;
        const data = JSON.parse(line);

        if (data.type === 'start') {
           totalCount = data.total_metrics;
        } else if (data.type === 'progress') {
           if (data.status === 'success') {
               accumulatedResults[data.metric] = data.result;
               completedCount++;
               
               if (onProgress) {
                   onProgress(data.metric, data.result, completedCount, totalCount);
               }
           } else if (data.status === 'error') {
               console.error(`Error in custom metric ${data.metric}:`, data.error);
               completedCount++;
               if (onProgress) {
                   onProgress(data.metric, null, completedCount, totalCount, data.error);
               }
           }
        }
      } catch (e) {
        console.error("Error parsing JSON chunk from custom stream", e);
      }
    };

    await readNdjsonStream(reader, processLine);

    // Since we stream per-metric, we need to assemble a unified response
    // similar to what backend would return in batch mode.
    const unifiedResponse: StandardizedEvaluationResponse = {
        timestamp: Date.now(),
        results: accumulatedResults,
        status: Object.keys(accumulatedResults).length === totalCount ? 'success' : 'partial',
        message: 'Stream completed'
    };

    return transformStandardizedResponse(unifiedResponse, conversation.length);

  } catch (error) {
    handleApiError(error);
    throw error;
  }
};
