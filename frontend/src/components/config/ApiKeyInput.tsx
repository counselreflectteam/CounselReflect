import React, { useState } from 'react';
import { Check, X, Loader2, Eye, EyeOff } from 'lucide-react';

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
  disabled?: boolean;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({
  label,
  value,
  onChange,
  onValidate,
  status,
  placeholder,
  helpUrl,
  helpText,
  disabled = false
}) => {
  const [showKey, setShowKey] = useState(false);

  const StatusIcon = () => {
    if (status === 'validating') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    if (status === 'valid') return <Check className="w-4 h-4 text-emerald-500" />;
    if (status === 'invalid') return <X className="w-4 h-4 text-red-500" />;
    return null;
  };

  const StatusLabel = () => {
    const colorClass =
      status === 'valid' ? 'text-emerald-600 dark:text-emerald-400' :
      status === 'invalid' ? 'text-red-600 dark:text-red-400' :
      'text-slate-500';

    const text =
      status === 'valid' ? 'Valid' :
      status === 'invalid' ? 'Invalid' :
      status === 'validating' ? 'Validating...' : '';

    if (!text) return null;
    return <span className={`text-xs font-medium ${colorClass}`}>{text}</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
        {status !== 'idle' && (
          <div className="flex items-center gap-2">
            <StatusIcon />
            <StatusLabel />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full px-4 py-2.5 pr-12 bg-white dark:bg-slate-700 border rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 ${
              status === 'valid' ? 'border-emerald-300 dark:border-emerald-600' :
              status === 'invalid' ? 'border-red-300 dark:border-red-600' :
              'border-slate-300 dark:border-slate-600'
            }`}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button
          onClick={onValidate}
          disabled={!value || status === 'validating' || disabled}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-medium text-sm transition-colors disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
        >
          {status === 'validating' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Validating
            </>
          ) : (
            'Validate'
          )}
        </button>
      </div>

      {(helpUrl || helpText) && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {helpText}{' '}
          {helpUrl && (
            <>
              Get it from{' '}
              <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                here
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
};
