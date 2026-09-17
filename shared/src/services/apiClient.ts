import axios from 'axios';
import toast from 'react-hot-toast';

const getDefaultApiUrl = () => {
    const configuredUrl = (import.meta as any).env?.VITE_API_BASE_URL;
    if (configuredUrl) return configuredUrl;

    if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
        return '/api';
    }

    // Extension pages (sidebar iframe) have no usable relative origin. Only
    // PRODUCTION builds default to the production API (the origin in manifest
    // host_permissions); dev builds must fail fast against localhost so a
    // missing .env.development.local never silently sends transcripts and
    // user keys to the production backend.
    if (
        typeof window !== 'undefined' &&
        window.location.protocol === 'chrome-extension:' &&
        (import.meta as any).env?.PROD
    ) {
        return 'https://api.counselreflect.com';
    }

    return 'http://localhost:8000';
};

export const API_URL = getDefaultApiUrl();
export const ACCESS_HEADER = 'X-CounselReflect-Access';

// Friendly copy for HTTP 429 from the evaluation capacity gate.
export const SERVER_BUSY_MESSAGE =
  'Every analysis seat is taken right now — give our one small server a minute, then retry. Don’t refresh the page, or your setup will be cleared.';
export const ACCESS_TOKEN_STORAGE_KEY = 'counselreflectAccessToken';
const NGROK_SKIP_BROWSER_WARNING_HEADER = 'ngrok-skip-browser-warning';

export const getPreviewTransportHeaders = (apiUrl: string): Record<string, string> =>
    /^https:\/\/[^/]+\.ngrok-free\.dev(?:\/|$)/i.test(apiUrl)
        ? { [NGROK_SKIP_BROWSER_WARNING_HEADER]: 'true' }
        : {};

const previewTransportHeaders = getPreviewTransportHeaders(API_URL);

export const getAccessToken = (): string => {
    if (typeof window === 'undefined') return '';
    return window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || '';
};

export const setAccessToken = (token: string) => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
};

// Fired whenever the stored access token is cleared (e.g. a 403 revealed it is
// stale) so the access gates (website AccessGate, extension AccessCodeCard) can
// re-lock and re-prompt instead of staying silently "unlocked".
export const ACCESS_TOKEN_CLEARED_EVENT = 'counselreflect:access-token-cleared';

export const clearAccessToken = () => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(ACCESS_TOKEN_CLEARED_EVENT));
};

/**
 * Shared policy for access-gate 403s on non-axios paths (the streaming fetch()
 * services). Returns true when the response was the access gate rejecting a
 * missing/stale token, in which case the token is cleared (re-locking the
 * gates via ACCESS_TOKEN_CLEARED_EVENT) and the user is toasted once.
 */
export const handleAccessGate403 = (status: number, detail: unknown): boolean => {
    if (status !== 403) return false;
    if (typeof detail !== 'string' || !detail.toLowerCase().includes('access code')) return false;
    clearAccessToken();
    toast.error("Access code required or invalid.", { id: 'access-gate' });
    return true;
};

export const withAccessHeaders = (headers: HeadersInit = {}): HeadersInit => {
    const token = getAccessToken();
    return token
        ? { ...headers, ...previewTransportHeaders, [ACCESS_HEADER]: token }
        : { ...headers, ...previewTransportHeaders };
};


// Default timeout so a dead backend/tunnel fails fast instead of wedging the UI.
// Long-running LLM-backed requests override this per call with LLM_REQUEST_TIMEOUT_MS;
// streaming evaluation paths use fetch() and are intentionally not time-limited here.
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const LLM_REQUEST_TIMEOUT_MS = 180_000;

export const api = axios.create({
    baseURL: API_URL,
    timeout: DEFAULT_REQUEST_TIMEOUT_MS,
    headers: {
        'Content-Type': 'application/json',
        ...previewTransportHeaders,
    },
});

api.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) {
        config.headers[ACCESS_HEADER] = token;
    }
    return config;
});

export const handleApiError = (error: any) => {
    // A deliberate cancel (AbortController / axios cancel) is not a failure; stay silent.
    if (error?.name === 'AbortError' || error?.name === 'CanceledError' || axios.isCancel(error)) {
        return;
    }

    let errorMessage = "Unknown error";

    if (axios.isAxiosError(error)) {
        // Never log the raw axios error: error.config carries the serialized request
        // body (API keys, transcripts) and the access header.
        console.error(
            "API Operation failed:",
            error.code ?? '',
            error.response?.status ?? '',
            error.response?.data?.detail ?? error.message
        );
        errorMessage = error.response?.data?.detail || error.message;

        if (error.response?.status === 429) {
            toast.error(SERVER_BUSY_MESSAGE, { id: 'server-busy', duration: 8000 });
            return;
        }

        if (error.code === 'ERR_NETWORK') {
             toast.error(
                "Cannot connect to the analysis server.\nIt might be starting up or downloading models.\nPlease wait a moment and try again.",
                { duration: 6000 }
            );
            return;
        }

        if (error.response?.status === 401) {
             toast.error("Authentication failed. Please check your API keys.");
             return;
        }

        if (error.response?.status === 403) {
            // Stored access token is missing or stale; clear it so the gates
            // re-prompt. Deduped by id: on a gated backend several startup
            // requests can 403 in parallel and would otherwise stack toasts.
            if (handleAccessGate403(403, error.response?.data?.detail)) {
                return;
            }
            // Other 403s fall through to the generic message below.
        }
    } else {
        console.error("API Operation failed:", error);
        if (error instanceof Error) {
            errorMessage = error.message;
        }
    }

    if (errorMessage === SERVER_BUSY_MESSAGE) {
        // Friendly capacity notice, not a failure — skip the harsh prefix.
        toast.error(SERVER_BUSY_MESSAGE, { id: 'server-busy', duration: 8000 });
        return;
    }

    toast.error(`Analysis Failed: ${errorMessage}`);
};
