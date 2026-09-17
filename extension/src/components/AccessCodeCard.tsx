import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  API_URL,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  withAccessHeaders
} from '@shared/services/apiClient';

/**
 * Compact access-code prompt for token-protected backends
 * (COUNSELREFLECT_ACCESS_TOKEN + X-CounselReflect-Access header).
 *
 * On mount it checks GET /access/status; when the gate is active and no valid
 * token is stored for this sidebar session, it renders a card asking for the
 * code. A successful POST /access/verify stores the token before the protected
 * provider tree mounts, so its first requests include the access header.
 */
export type BackendAccessState = 'checking' | 'granted' | 'required' | 'unavailable';
const ACCESS_REQUEST_TIMEOUT_MS = 10_000;

interface AccessCodeCardProps {
  onStateChange: (state: BackendAccessState) => void;
}

export const AccessCodeCard: React.FC<AccessCodeCardProps> = ({ onStateChange }) => {
  const requireAccessCode =
    String((import.meta as any).env?.VITE_REQUIRE_ACCESS_CODE || '').toLowerCase() === 'true';
  const [state, setState] = useState<BackendAccessState>('checking');
  const [accessCode, setAccessCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const updateState = useCallback((nextState: BackendAccessState) => {
    setState(nextState);
    onStateChange(nextState);
  }, [onStateChange]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), ACCESS_REQUEST_TIMEOUT_MS);

    const checkAccess = async () => {
      updateState('checking');
      setError(null);
      try {
        const response = await fetch(`${API_URL}/access/status`, {
          headers: withAccessHeaders(),
          signal: controller.signal
        });
        if (!response.ok) {
          if (!cancelled) updateState('unavailable');
          return;
        }
        const status = (await response.json()) as { required?: boolean };
        if (cancelled) return;
        if (status.required === false) {
          // A password-required preview must fail closed if its backend was
          // accidentally deployed without the access gate.
          updateState(requireAccessCode ? 'unavailable' : 'granted');
          return;
        }
        if (status.required !== true) {
          updateState('unavailable');
          return;
        }

        // Silently re-verify a stored token; only prompt when it is missing or stale.
        const existingToken = getAccessToken();
        if (existingToken) {
          const verify = await fetch(`${API_URL}/access/verify`, {
            method: 'POST',
            headers: withAccessHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ access_token: existingToken }),
            signal: controller.signal
          });
          if (verify.ok) {
            if (!cancelled) updateState('granted');
            return;
          }
          if (cancelled) return;
          if (verify.status !== 403) {
            updateState('unavailable');
            return;
          }
          clearAccessToken();
        }

        if (!cancelled) updateState('required');
      } catch {
        if (!cancelled) updateState('unavailable');
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void checkAccess();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [requireAccessCode, retryCount, updateState]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = accessCode.trim();
    if (!candidate) {
      setError('Enter the access code.');
      return;
    }

    setIsVerifying(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), ACCESS_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_URL}/access/verify`, {
        method: 'POST',
        headers: withAccessHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ access_token: candidate }),
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 403) {
          setError('Access code is not valid.');
        } else if (response.status === 429) {
          setError('Too many attempts. Wait a few minutes and try again.');
        } else {
          updateState('unavailable');
        }
        return;
      }
      setAccessToken(candidate);
      updateState('granted');
    } catch {
      setError('Cannot reach the analysis server.');
    } finally {
      window.clearTimeout(timeoutId);
      setIsVerifying(false);
    }
  };

  if (state === 'granted') return null;

  if (state === 'checking') {
    return (
      <section className="cr-module cr-enter flex items-center gap-3 p-4" aria-live="polite">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--cr-brand-primary)]" aria-hidden />
        <div>
          <h2 className="text-sm font-bold text-[var(--cr-ink)]">Checking secure access</h2>
          <p className="mt-0.5 text-xs leading-5 text-[var(--cr-ink-2)]">
            Confirming that the analysis server is ready before loading the workspace.
          </p>
        </div>
      </section>
    );
  }

  if (state === 'unavailable') {
    return (
      <section className="cr-module cr-enter border-l-[3px] border-l-amber-500 p-4" role="alert">
        <h2 className="text-base font-bold text-[var(--cr-ink)]">Secure analysis unavailable</h2>
        <p className="mt-1 text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
          CounselReflect could not confirm that this analysis server enforces preview access. The extension is locked so it does not send transcripts to an unverified backend.
        </p>
        <p className="mt-2 text-xs leading-5 text-[var(--cr-ink-2)]">
          Ask the workspace administrator to deploy the current analysis server, then retry.
        </p>
        <button
          type="button"
          onClick={() => setRetryCount((count) => count + 1)}
          className="cr-btn cr-btn-secondary cr-focus mt-3 h-9 px-4"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </button>
      </section>
    );
  }

  return (
    /* Access gate — the cobalt accent slab (cr-module-accent = ink slab +
       cobalt signal edge): white title / slab-ink-2 body; the input punches
       back to the canvas as a well so its ink stays AA in both modes. */
    <section className="cr-module-accent cr-enter p-4">
      <h2 className="text-lg font-bold leading-6 tracking-tight text-[var(--cr-slab-ink)]">
        Preview access
      </h2>
      <p className="mt-1 text-[0.8125rem] leading-snug text-[var(--cr-slab-ink-2)]">
        This CounselReflect server requires an access code before it accepts requests.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
        <label htmlFor="counselreflect-access-code" className="sr-only">
          Access code
        </label>
        <input
          id="counselreflect-access-code"
          type="password"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          placeholder="Access code"
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'counselreflect-access-error' : undefined}
          className="cr-control cr-focus h-9 w-full min-w-0 flex-1 rounded-lg border border-[var(--cr-input-border)] bg-[var(--cr-bg)] px-3 text-sm text-[var(--cr-ink)] placeholder:text-[var(--cr-ink-3)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={isVerifying}
          className="cr-btn cr-btn-primary cr-focus h-9 shrink-0 px-4 text-sm"
        >
          {isVerifying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Unlock
        </button>
      </form>
      {error && (
        <p id="counselreflect-access-error" role="alert" className="mt-2 text-xs font-medium text-rose-300">
          {error}
        </p>
      )}
    </section>
  );
};
