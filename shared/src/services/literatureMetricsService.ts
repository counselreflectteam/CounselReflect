import { api, handleApiError, API_URL } from './apiClient';
import { TargetSpeaker, EvaluationResult } from '../types';
import { transformStandardizedResponse, StandardizedEvaluationResponse } from './transformers/evaluationTransformer';

export interface LiteratureMetric {
  metricName: string;
  definition: string;
  whyThisMatters: string;
  references: string[];
  needHighlight: boolean;
  category: string;
  target: TargetSpeaker;
  level1Description?: string;
  level3Description?: string;
  level5Description?: string;
}

export interface LiteratureMetricsResponse {
  metrics: LiteratureMetric[];
  total: number;
}

/**
 * Fetch all available literature metrics.
 */
export const fetchLiteratureMetrics = async (): Promise<LiteratureMetricsResponse> => {
  try {
    const response = await api.get<{ metrics: any[], total: number }>('/literature/metrics');
    // Map snake_case from backend to camelCase for frontend
    const metrics = response.data.metrics.map(m => ({
      ...m,
      metricName: m.metric_name,
      whyThisMatters: m.why_this_matters,
      needHighlight: m.need_highlight ?? false,
      level1Description: m.level_1_description,
      level3Description: m.level_3_description,
      level5Description: m.level_5_description
    }));
    return {
      metrics,
      total: response.data.total
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Evaluate conversation using literature-based rubrics.
 *
 * @param conversation - Array of conversation messages with speaker and text
 * @param metricNames - Names of literature metrics to evaluate
 * @param provider - LLM provider (openai, gemini, claude)
 * @param model - Model identifier
 * @param apiKey - API key for the selected provider
 * @param signal - Optional abort signal for cancellation
 * @returns Evaluation results for each metric
 */
export type LiteratureMetricsOnProgressCallback = (
  metric: string, 
  result: any, 
  completedCount: number, 
  totalCount: number
) => void;

export const evaluateLiteratureMetricsStream = async (
  conversation: { speaker: string; text: string }[],
  metricNames: string[],
  provider: string,
  model: string,
  onProgress?: LiteratureMetricsOnProgressCallback,
  apiKey?: string,
  signal?: AbortSignal
): Promise<EvaluationResult> => {
  try {
    const requestBody: Record<string, unknown> = {
      conversation,
      metric_names: metricNames,
      provider,
      model
    };
    
    if (apiKey) {
      requestBody.api_key = apiKey;
    }
    
    const response = await fetch(`${API_URL}/literature/evaluate/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.body) throw new Error("No response body");
    if (!response.ok) {
        let errorDetail = `Literature stream request failed: ${response.status} ${response.statusText}`;
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
    let totalCount = metricNames.length; 

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
               console.error(`Error in literature metric ${data.metric}:`, data.error);
               completedCount++;
               if (onProgress) {
                   onProgress(data.metric, null, completedCount, totalCount);
               }
           }
        }
      } catch (e) {
        console.error("Error parsing JSON chunk from literature stream", e);
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

    // Construct the final response object expected by transformer
    const standardizedResponse: StandardizedEvaluationResponse = {
        timestamp: Date.now(),
        results: accumulatedResults,
        status: Object.keys(accumulatedResults).length === totalCount ? 'success' : 'partial',
        message: 'Stream completed'
    };

    return transformStandardizedResponse(standardizedResponse, conversation.length);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};


/**
 * Evaluate conversation using literature-based rubrics (non-streaming version for extension).
 * 
 * @param conversation - Array of conversation messages with speaker and text
 * @param metricNames - Names of literature metrics to evaluate
 * @param apiKey - API key for the selected provider
 * @param provider - LLM provider (openai, gemini, claude)
 * @param model - Model identifier
 * @returns Standardized evaluation response
 */
export const evaluateLiteratureMetrics = async (
  conversation: { speaker: string; text: string }[],
  metricNames: string[],
  apiKey: string,
  provider: string,
  model: string
): Promise<StandardizedEvaluationResponse> => {
  try {
    const requestBody = {
      conversation,
      metric_names: metricNames,
      provider,
      model,
      api_key: apiKey
    };
    
    const response = await api.post<StandardizedEvaluationResponse>(
      '/literature/evaluate',
      requestBody
    );
    
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};
