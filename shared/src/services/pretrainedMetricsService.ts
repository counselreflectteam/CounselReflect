import { api, handleApiError, API_URL } from './apiClient';
import {
  Conversation, EvaluationResult, PredefinedMetricResponse, Role
} from '../types';
import { transformStandardizedResponse, StandardizedEvaluationResponse } from './transformers/evaluationTransformer';

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


export const evaluatePretrainedModel = async (
  conversation: Conversation,
  metricsNames: string[],
  apiKeys: Record<string, string>,
  provider: string,
  model: string,
  signal?: AbortSignal
): Promise<EvaluationResult> => {

  const backendConversation = conversation.messages
    .map(msg => ({
      speaker: msg.role === Role.Therapist ? 'Therapist' : 'Patient',
      text: msg.content
    }));

  const requestBody: any = {
    conversation: backendConversation,
    metrics: metricsNames,
    provider: provider,
    model: model,
    api_key : apiKeys[provider],
    huggingface_api_key : apiKeys.hf
  };
  
  try {
    const response = await api.post('/predefined_metrics/evaluate', requestBody, { signal });
    const data = response.data as StandardizedEvaluationResponse;

    if (data.status === 'error') {
      throw new Error(data.message || 'Unknown evaluation error');
    }
    
    // Use unified transformer
    return transformStandardizedResponse(data, conversation.messages.length);
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export type OnProgressCallback = (
  metric: string, 
  result: any, 
  completedCount: number, 
  totalCount: number
) => void;

export const evaluatePretrainedModelStream = async (
  conversation: Conversation,
  metricsNames: string[],
  apiKeys: Record<string, string>,
  provider: string,
  model: string,
  onProgress?: OnProgressCallback,
  signal?: AbortSignal
): Promise<EvaluationResult> => {

  const backendConversation = conversation.messages
    .map(msg => ({
      speaker: msg.role === Role.Therapist ? 'Therapist' : 'Patient',
      text: msg.content
    }));

  const requestBody = {
    conversation: backendConversation,
    metrics: metricsNames,
    provider: provider,
    model: model,
    api_key : apiKeys[provider],
    huggingface_api_key : apiKeys.hf
  };

  try {
    const response = await fetch(`${API_URL}/predefined_metrics/evaluate/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.body) throw new Error("No response body");
    if (!response.ok) {
        let errorDetail = `Stream request failed: ${response.status} ${response.statusText}`;
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
                    onProgress(data.metric, null, completedCount, totalCount);
                }
            }
        }
      } catch (e) {
         console.error("Error parsing JSON chunk", e);
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

    return transformStandardizedResponse(standardizedResponse, conversation.messages.length);

  } catch (error) {
    console.error('Stream evaluation error:', error);
    handleApiError(error);
    throw error;
  }
};