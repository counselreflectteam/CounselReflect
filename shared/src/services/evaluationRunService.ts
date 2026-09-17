import { API_URL, withAccessHeaders } from './apiClient';


const CANCEL_REQUEST_TIMEOUT_MS = 4_000;

export const createEvaluationRunId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const cancelEvaluationRun = async (runId: string): Promise<void> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CANCEL_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_URL}/evaluation-runs/${encodeURIComponent(runId)}/cancel`,
      {
        method: 'POST',
        headers: withAccessHeaders(),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Cancellation request failed with status ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
};
