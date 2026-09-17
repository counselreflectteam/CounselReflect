import axios from 'axios';
import { api } from './apiClient';

export const validateHfKey = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await api.post('/models/validate_key', {
      provider: 'huggingface',
      api_key: apiKey
    });
    return response.data.valid;
  } catch (error) {
    // Never log the raw axios error: its config carries the key in plaintext.
    console.error(
      'HF key validation failed:',
      axios.isAxiosError(error) ? (error.response?.status ?? error.code ?? error.message) : error
    );
    return false;
  }
};
