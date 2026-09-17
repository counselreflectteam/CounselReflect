import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  Moon,
  RefreshCw,
  Sun
} from 'lucide-react';
import { useTheme } from '@shared/context';
import {
  ACCESS_TOKEN_CLEARED_EVENT,
  API_URL,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  withAccessHeaders
} from '@shared/services/apiClient';
import { KeySketch, PencilUnderline } from '../design/NotebookMarks';

type AccessStatusResponse = {
  required: boolean;
};

const GateShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isDarkMode, toggleDarkMode } = useTheme();

  return (
    <div className="relative min-h-screen bg-[var(--cr-bg)] text-[var(--cr-ink)]">
      <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <button
          type="button"
          onClick={toggleDarkMode}
          className="cr-control cr-focus absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--cr-card-border)] bg-[var(--cr-card)] text-[var(--cr-ink-2)] hover:text-[var(--cr-ink)] sm:right-7 sm:top-7"
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="w-full max-w-md">
          <div className="mb-9 flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-10 w-10 object-contain" />
            <div>
              <p className="font-semibold text-[var(--cr-ink)]">CounselReflect</p>
              <p className="text-sm text-[var(--cr-ink-2)]">Private research preview</p>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
};

export const AccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Start in an "unknown, checking" state and render nothing until
  // /access/status settles: assuming the gate is required would flash the
  // access-code page at every visitor on ungated (public) deployments.
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(() => Boolean(getAccessToken()));
  const [accessRequired, setAccessRequired] = useState<boolean | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const verifyAccessCode = useCallback(async (candidate: string, silent = false) => {
    if (!candidate.trim()) {
      if (!silent) setError('Enter the access code.');
      return false;
    }

    if (!silent) setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/access/verify`, {
        method: 'POST',
        headers: withAccessHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ access_token: candidate.trim() })
      });

      if (response.status === 429) {
        // Rate-limited, not necessarily wrong — keep any stored token.
        if (!silent) setError('Too many attempts. Wait a few minutes and try again.');
        return false;
      }

      if (!response.ok) {
        clearAccessToken();
        if (!silent) setError('That access code is not valid.');
        return false;
      }

      setAccessToken(candidate.trim());
      setIsUnlocked(true);
      setError(null);
      return true;
    } catch {
      if (!silent) setError('The analysis server is not responding. Try again in a moment.');
      return false;
    } finally {
      if (!silent) setIsSubmitting(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      try {
        const response = await fetch(`${API_URL}/access/status`, {
          headers: withAccessHeaders()
        });
        if (response.status === 404) {
          if (!cancelled) {
            setAccessRequired(false);
            setIsUnlocked(true);
          }
          return;
        }
        if (!response.ok) throw new Error('Access status unavailable');

        const status = (await response.json()) as AccessStatusResponse;
        if (cancelled) return;

        setAccessRequired(status.required);
        if (!status.required) {
          setIsUnlocked(true);
          return;
        }

        const existingToken = getAccessToken();
        if (existingToken) await verifyAccessCode(existingToken, true);
      } catch {
        if (!cancelled) {
          if (getAccessToken()) {
            // Keep a previously unlocked workspace visible while the server is
            // busy. Protected API routes still validate the token and relock
            // the app through the shared 403 handler if it is no longer valid.
            setAccessRequired(true);
            setIsUnlocked(true);
          } else {
            setError('The analysis server is not responding. Try again in a moment.');
            setAccessRequired(null);
            setIsUnlocked(false);
          }
        }
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    };

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [retryNonce, verifyAccessCode]);

  useEffect(() => {
    const relock = () => {
      setIsUnlocked(false);
      setAccessRequired(true);
      setIsChecking(false);
    };
    window.addEventListener(ACCESS_TOKEN_CLEARED_EVENT, relock);
    return () => window.removeEventListener(ACCESS_TOKEN_CLEARED_EVENT, relock);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    await verifyAccessCode(accessCode);
  };

  if (isChecking && !isUnlocked) {
    return null;
  }

  if (accessRequired === null && !isUnlocked) {
    return (
      <GateShell>
        <KeySketch className="h-14 w-14 text-amber-700 dark:text-amber-300" />
        <h1 className="cr-page-title mt-6 text-[28px]">Preview temporarily unavailable</h1>
        <p className="mt-3 text-[15px] leading-6 text-[var(--cr-ink-2)]">
          CounselReflect could not confirm the preview access policy. The workspace stays locked until
          the analysis server responds.
        </p>
        {error && <p className="mt-4 text-sm text-amber-800 dark:text-amber-200" role="alert">{error}</p>}
        <button
          type="button"
          onClick={() => {
            setIsChecking(true);
            setError(null);
            setRetryNonce((value) => value + 1);
          }}
          className="cr-btn cr-btn-primary cr-focus mt-7"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Retry connection
        </button>
      </GateShell>
    );
  }

  if (accessRequired && !isUnlocked) {
    return (
      <GateShell>
        <KeySketch className="h-16 w-16 text-[var(--cr-brand-primary)]" />
        <p className="cr-kicker mt-6">Invited reviewers only</p>
        <div className="relative mt-2 pb-2">
          <h1 className="cr-page-title text-[32px]">Enter the private preview</h1>
          <PencilUnderline className="absolute -bottom-0.5 left-0 h-2.5 w-4/5 text-[var(--cr-brand-primary)] opacity-55" />
        </div>
        <p className="mt-3 max-w-sm text-[15px] leading-6 text-[var(--cr-ink-2)]">
          Use the access code shared with you by the CounselReflect team.
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          <label htmlFor="access-code" className="block text-sm font-semibold text-[var(--cr-ink)]">
            Access code
          </label>
          <div className="relative mt-2">
            <input
              id="access-code"
              type={showCode ? 'text' : 'password'}
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              className="cr-focus h-12 w-full rounded-lg border border-[var(--cr-input-border)] bg-[var(--cr-card)] px-3.5 pr-12 text-[15px] text-[var(--cr-ink)] outline-none"
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'access-code-error' : undefined}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowCode((value) => !value)}
              className="cr-control cr-focus absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
              aria-label={showCode ? 'Hide access code' : 'Show access code'}
            >
              {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error && (
            <p id="access-code-error" className="mt-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="cr-btn cr-btn-primary cr-focus mt-5 h-12 w-full"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isSubmitting ? 'Checking code' : 'Open workspace'}
          </button>
        </form>

        <div className="mt-7 border-t border-[var(--cr-card-border)] pt-5">
          <p className="text-xs font-semibold text-[var(--cr-brand-leaf)]">Data handling</p>
          <p className="mt-1 text-[13px] leading-5 text-[var(--cr-ink-2)]">
            The analysis server does not persist submitted transcripts. The current tab keeps a temporary
            browser-session copy so a refresh does not lose the review.
          </p>
        </div>
      </GateShell>
    );
  }

  return <>{children}</>;
};
