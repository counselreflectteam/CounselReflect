import { SERVER_BUSY_MESSAGE, handleAccessGate403 } from './apiClient';

/**
 * Shared HTTP-error policy for the streaming fetch() paths, which bypass the
 * axios interceptor in apiClient. Extracts the backend's error detail and —
 * critically — routes access-gate 403s through the same clear-token/re-lock
 * policy as axios requests, so a stale access code re-prompts the gate
 * instead of failing every evaluation run forever.
 *
 * Call only when `!response.ok`; always throws.
 */
export async function throwStreamRequestError(
  response: Response,
  contextLabel: string
): Promise<never> {
  let errorDetail = `${contextLabel} request failed: ${response.status} ${response.statusText}`;
  let detail: unknown;
  try {
    const errorData = await response.clone().json();
    if (errorData.detail) {
      detail = errorData.detail;
      errorDetail = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
    }
  } catch (e) { /* ignore non-JSON bodies */ }

  handleAccessGate403(response.status, detail);
  if (response.status === 429) {
    throw new Error(SERVER_BUSY_MESSAGE);
  }
  throw new Error(errorDetail);
}

/**
 * Reads a newline-delimited JSON stream, invoking `onLine` for each complete line
 * (and once more for any trailing partial line after the stream ends).
 *
 * Shared by the pretrained / custom / literature metric streaming services, which
 * previously each inlined an identical reader/decoder/buffer loop.
 */
export async function readNdjsonStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // The last element may be an incomplete line; keep it for the next read.
    buffer = lines.pop() || '';
    for (const line of lines) onLine(line);
  }

  // Flush the decoder and process any remaining buffered content.
  buffer += decoder.decode();
  if (buffer.trim() !== '') onLine(buffer);
}
