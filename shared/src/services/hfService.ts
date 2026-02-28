import { api } from './apiClient';

export const validateHfKey = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await api.post('/models/validate_key', {
      provider: 'huggingface',
      api_key: apiKey
    });
    return response.data.valid;
  } catch (error) {
    console.error('HF key validation failed:', error);
    return false;
  }
};
