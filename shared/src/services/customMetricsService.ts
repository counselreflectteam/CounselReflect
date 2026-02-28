import { api, handleApiError, API_URL } from './apiClient';
import { transformStandardizedResponse, StandardizedEvaluationResponse } from './transformers/evaluationTransformer';


// Types
export type TargetSpeaker = 'therapist' | 'patient' | 'both';

export interface MetricDefinitionResponse {
  name: string;
  description: string;
  scale: string;
  guidance: string;
  examples: string[];
  target: TargetSpeaker;
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
    
    const response = await api.post<RefineMetricsResponse>('/customize_pipeline/refine_metrics', payload);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Update example outputs based on rubric.
 */
export const updateExampleOutputs = async (payload: UpdateExampleOutputsRequest) => {
  try {
    const response = await api.post('/customize_pipeline/update_example_outputs', payload);
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
    const response = await api.post<RefineMetricsResponse>('/customize_pipeline/update_rubric_from_examples', payload);
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
    const response = await api.post('/customize_pipeline/rescore_examples', payload);
    return response.data.outputs;
  } catch (error) {
    handleApiError(error);
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
    handleApiError(error);
    throw error;
  }
};

/**
 * Score conversation with locked profile.
 */
export const scoreWithProfile = async (payload: ScoreWithProfileRequest, signal?: AbortSignal): Promise<Record<string, any>> => {
  try {
    const response = await api.post<Record<string, any>>('/customize_pipeline/score_with_profile', payload, { signal });
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
function buildProfilePayload(
  request: CustomMetricsEvalRequest
): ScoreWithProfileRequest {
  const { conversation, selectedMetricNames, lockedProfile, apiKey, provider, model } = request;
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
    model
  };
  if (apiKey) payload.api_key = apiKey;
  return payload;
}

/**
 * Evaluate conversation using custom metrics from a locked profile.
 * Filters the rubric to only include selected metrics, then calls scoreWithProfile.
 */
export const evaluateCustomMetrics = async (
  request: CustomMetricsEvalRequest,
  signal?: AbortSignal
): Promise<CustomMetricsEvalResult> => {
  const { conversation } = request;
  const profilePayload = buildProfilePayload(request);
  try {
    const response = await scoreWithProfile(profilePayload, signal) as StandardizedEvaluationResponse;
    return transformStandardizedResponse(response, conversation.length);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export type CustomMetricsOnProgressCallback = (
  metric: string, 
  result: any, 
  completedCount: number, 
  totalCount: number
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profilePayload),
      signal
    });

    if (!response.body) throw new Error("No response body");
    if (!response.ok) {
        let errorDetail = `Custom stream request failed: ${response.status} ${response.statusText}`;
        try {
            const errorData = await response.clone().json();
            if (errorData.detail) {
                errorDetail = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
            }
        } catch(e) { /* ignore */ }
        throw new Error(errorDetail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
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
                   onProgress(data.metric, null, completedCount, totalCount);
               }
           }
        }
      } catch (e) {
        console.error("Error parsing JSON chunk from custom stream", e);
      }
    };

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      const lines = buffer.split('\n');
      // The last element is potentially incomplete (or empty if the chunk ended with \n)
      // We save it back to buffer for the next iteration
      buffer = lines.pop() || '';

      for (const line of lines) {
        processLine(line);
      }
    }
    
    // Flush any remaining characters from the decoder
    buffer += decoder.decode();

    // Process any remaining buffer content after stream ends
    if (buffer.trim() !== '') {
        processLine(buffer);
    }

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
