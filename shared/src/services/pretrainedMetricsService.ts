import { api, handleApiError, API_URL, withAccessHeaders } from './apiClient';
import {
  Conversation, EvaluationResult, PredefinedMetricResponse, Role
} from '../types';
import { transformStandardizedResponse, StandardizedEvaluationResponse } from './transformers/evaluationTransformer';
import { readNdjsonStream, throwStreamRequestError } from './streamingUtils';

export const fetchPretrainedMetrics = async (): Promise<PredefinedMetricResponse> => {
  try {
    const response = await api.get('/predefined_metrics/metrics');
    const data = response.data;
    return data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};


export type OnProgressCallback = (
  metric: string,
  result: any,
  completedCount: number,
  totalCount: number,
  errorReason?: string
) => void;

export const evaluatePretrainedModelStream = async (
  conversation: Conversation,
  metricsNames: string[],
  apiKeys: Record<string, string>,
  provider: string,
  model: string,
  onProgress?: OnProgressCallback,
  signal?: AbortSignal,
  runId?: string
): Promise<EvaluationResult> => {

  const backendConversation = conversation.messages
    .map(msg => ({
      speaker: msg.role === Role.Chatbot ? 'Therapist' : 'Patient',
      text: msg.content
    }));

  const requestBody = {
    conversation: backendConversation,
    metrics: metricsNames,
    provider: provider,
    model: model,
    api_key : apiKeys[provider],
    huggingface_api_key : apiKeys.hf,
    run_id: runId
  };

  try {
    const response = await fetch(`${API_URL}/predefined_metrics/evaluate/stream`, {
      method: 'POST',
      headers: withAccessHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.body) throw new Error("No response body");
    if (!response.ok) {
        await throwStreamRequestError(response, 'Stream');
    }

    const reader = response.body.getReader();

    // Accumulate results to match StandardizedEvaluationResponse structure
    const accumulatedResults: Record<string, any> = {};
    let completedCount = 0;
    let totalCount = metricsNames.length; 

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
                console.error(`Error in metric ${data.metric}:`, data.error);
                // metric failed but stream continues
                completedCount++;
                if (onProgress) {
                    onProgress(data.metric, null, completedCount, totalCount, data.error);
                }
            }
        }
      } catch (e) {
         console.error("Error parsing JSON chunk", e);
      }
    };

    await readNdjsonStream(reader, processLine);

    // Construct the final response object expected by transformer
    const standardizedResponse: StandardizedEvaluationResponse = {
        timestamp: Date.now(),
        results: accumulatedResults,
        status: Object.keys(accumulatedResults).length === totalCount ? 'success' : 'partial',
        message: 'Stream completed'
    };

    return transformStandardizedResponse(standardizedResponse, conversation.messages.length);

  } catch (error) {
    if (signal?.aborted || error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error('Stream evaluation error:', error);
    handleApiError(error);
    throw error;
  }
};
