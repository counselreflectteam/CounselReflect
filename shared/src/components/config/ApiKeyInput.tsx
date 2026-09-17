import React, { useId, useState } from 'react';
import { AlertCircle, Check, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react';

export type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

interface ApiKeyInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onValidate: () => void;
  status: ValidationStatus;
  placeholder?: string;
  helpUrl?: string;
  helpText?: string;
  helpLinkText?: string;
  disabled?: boolean;
}

/**
 * Key entry row. Renders on cr-module ground (inside the provider console),
 * so the field is a well (canvas fill) and the secondary button's muted
 * hover fill inverts to the canvas value.
 */
export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({
  label,
  value,
  onChange,
  onValidate,
  status,
  placeholder,
  helpUrl,
  helpText,
  helpLinkText,
  disabled = false
}) => {
  const [showKey, setShowKey] = useState(false);
  const inputId = useId();

  const statusText =
    status === 'valid' ? 'Valid' :
    status === 'invalid' ? 'Invalid key' :
    status === 'validating' ? 'Verifying…' : '';

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={inputId} className="text-xs font-semibold text-[var(--cr-ink-2)]">
          {label}
        </label>
        {helpUrl && (
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="cr-link cr-focus inline-flex items-center gap-1 rounded-sm text-xs font-semibold"
          >
            {helpLinkText ?? 'Key setup guide'}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={inputId}
            type={showKey ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="new-password"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            className={`cr-focus h-9 w-full rounded-lg border border-[var(--cr-input-border)] bg-[var(--cr-bg)] px-3 text-sm text-[var(--cr-ink)] placeholder:text-[var(--cr-ink-3)] focus:outline-none disabled:cursor-not-allowed disabled:bg-[var(--cr-muted)] disabled:text-[var(--cr-ink-3)] ${
              status !== 'idle' ? 'pr-16' : 'pr-10'
            }`}
          />
          {status !== 'idle' && (
            <span className="absolute right-9 top-1/2 -translate-y-1/2" aria-hidden>
              {status === 'validating' && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--cr-ink-3)]" />}
              {status === 'valid' && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
              {status === 'invalid' && <AlertCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            disabled={disabled}
            className="cr-focus absolute right-3 top-1/2 -translate-y-1/2 rounded-full text-[var(--cr-ink-3)] hover:text-[var(--cr-ink)] dark:hover:text-[var(--cr-ink)]"
            aria-label={showKey ? `Hide ${label}` : `Show ${label}`}
            title={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={onValidate}
          disabled={!value || status === 'validating' || disabled}
          className="cr-btn cr-btn-secondary cr-focus h-9 shrink-0 whitespace-nowrap px-4 enabled:hover:bg-[var(--cr-bg)]!"
        >
          {status === 'validating' ? 'Verifying…' : 'Verify'}
        </button>
      </div>

      {statusText && (
        <p className={`mt-1.5 text-xs ${status === 'invalid' ? 'text-rose-600 dark:text-rose-300' : 'text-[var(--cr-ink-3)]'}`}>
          {statusText}
        </p>
      )}

      {helpText && <p className="cr-meta mt-1.5 leading-5">{helpText}</p>}
    </div>
  );
};
