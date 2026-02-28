import { api, handleApiError } from './apiClient';

// Types
export interface SummaryRequest {
  conversation: { role: string; content: string }[] | { speaker: string; text: string }[];
  evaluation_results: Record<string, any>;
  api_key?: string;
  provider: string;
  model: string;
  use_turn_numbers?: boolean;
}

export interface SummaryResponse {
  overall_performance: string;
  strengths: string[];
  areas_for_improvement: string[];
  key_insights: string[];
}

export interface ChatbotRequest {
  conversation: { role: string; content: string }[] | { speaker: string; text: string }[];
  evaluation_results: Record<string, any>;
  messages: Array<{ role: string; content: string }>;
  api_key?: string;
  provider: string;
  model: string;
  user_role?: 'therapist' | 'patient';
  use_turn_numbers?: boolean;
}

export interface ChatbotResponse {
  message: string;
}

// API Functions

/**
 * Generate summary of evaluation results.
 */
export const generateSummary = async (
  request: SummaryRequest,
  signal?: AbortSignal
): Promise<SummaryResponse> => {
  try {
    const response = await api.post<SummaryResponse>('/summary/generate', request, { signal });
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

/**
 * Send message to chatbot about evaluation results.
 */
export const sendChatbotMessage = async (
  request: ChatbotRequest,
  signal?: AbortSignal
): Promise<ChatbotResponse> => {
  try {
    const response = await api.post<ChatbotResponse>('/summary/chatbot', request, { signal });
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};
