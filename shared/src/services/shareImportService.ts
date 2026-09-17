import axios from 'axios';
import { api, handleAccessGate403 } from './apiClient';

/** One turn as returned by the backend: raw speaker label + text. Role
 *  interpretation (chatbot/client) is the frontend's job via normalizeRole. */
export interface ShareMessage {
  speaker: string;
  text: string;
}

export interface ShareImportResponse {
  provider: string;
  title: string;
  messages: ShareMessage[];
  turn_count: number;
}

/** Carries the backend's human-readable `detail` so the caller can show the
 *  exact guidance (e.g. the Gemini "upload a file instead" message) rather
 *  than a generic failure toast. */
export class ShareImportError extends Error {
  status?: number;
  /** True when the failure was already surfaced to the user (e.g. the access
   *  gate showed its own toast), so the caller should not toast again. */
  handled: boolean;
  constructor(message: string, status?: number, handled = false) {
    super(message);
    this.name = 'ShareImportError';
    this.status = status;
    this.handled = handled;
  }
}

const DEFAULT_MESSAGE = 'Could not import that share link. Check the link and try again.';

/**
 * Import a public ChatGPT or Claude share link into a transcript. The backend
 * fetches and normalizes the shared conversation (the browser can't read those
 * hosts cross-origin). Throws ShareImportError with a user-facing message.
 */
export const importSharedConversation = async (
  url: string,
  signal?: AbortSignal
): Promise<ShareImportResponse> => {
  try {
    const response = await api.post<ShareImportResponse>(
      '/share_import/fetch',
      { url },
      { signal, timeout: 40_000 }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      // Keep the access gate honest: a stale token surfaces as 403 here too.
      // handleAccessGate403 shows its own toast, so mark this handled to avoid
      // a second stacked toast at the call site.
      if (status === 403 && handleAccessGate403(403, error.response?.data?.detail)) {
        throw new ShareImportError('Access code required for this preview.', 403, true);
      }
      const detail = error.response?.data?.detail;
      throw new ShareImportError(
        typeof detail === 'string' && detail ? detail : DEFAULT_MESSAGE,
        status
      );
    }
    throw new ShareImportError(DEFAULT_MESSAGE);
  }
};
