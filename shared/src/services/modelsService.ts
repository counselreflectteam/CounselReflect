import { api } from './apiClient';
import { ModelInfo, ModelsResponse } from '../types';

export interface ValidateKeyResponse {
  valid: boolean;
  provider: string;
  message?: string;
}

export interface ServerKeyStatus {
  openai?: boolean;
  gemini?: boolean;
  claude?: boolean;
  hf?: boolean;
  [provider: string]: boolean | undefined;
}

/**
 * Fetch all available models from the backend
 * Returns models organized by provider (excludes Ollama)
 */
export const fetchAvailableModels = async (): Promise<ModelsResponse> => {
  const response = await api.get<{ providers: Record<string, ModelInfo[]>; total_models: number }>('/models');

  // Filter out Ollama provider as it's not supported in extension
  const { providers } = response.data;
  const filteredProviders: Record<string, ModelInfo[]> = {};

  for (const [provider, models] of Object.entries(providers)) {
    if (provider !== 'ollama') {
      filteredProviders[provider] = models;
    }
  }

  return {
    providers: filteredProviders,
    total_models: Object.values(filteredProviders).reduce(
      (sum, models) => sum + models.length,
      0
    )
  };
};

/**
 * Check which provider keys are configured on the backend.
 * The backend returns booleans only, never secret values.
 */
export const fetchServerKeyStatus = async (): Promise<ServerKeyStatus> => {
  const response = await api.get<ServerKeyStatus>('/models/server-keys-status');
  return response.data;
};

/**
 * Validate an API key for a specific provider via the backend
 */
export const validateApiKey = async (
  provider: string,
  apiKey: string
): Promise<ValidateKeyResponse> => {
  const response = await api.post<ValidateKeyResponse>('/models/validate_key', {
    provider,
    api_key: apiKey
  });
  return response.data;
};
