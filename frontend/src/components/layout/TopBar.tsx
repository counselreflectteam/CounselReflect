import React from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, MessageCircle, Moon, Sun } from 'lucide-react';
import { useEvaluationState, useTheme } from '@shared/context';
import { EvaluationStatus } from '@shared/types';

const pageTitles: Record<string, string> = {
  '/intro': 'Home',
  '/setup': 'Add transcript',
  '/configure': 'Evaluation criteria',
  '/results': 'Report'
};

export const TopBar: React.FC = () => {
  const location = useLocation();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { status } = useEvaluationState();
  const isEvaluating = location.pathname === '/configure' && status === EvaluationStatus.Loading;
  const pageTitle = pageTitles[location.pathname] || 'Workspace';

  return (
    <header className="flex h-[52px] flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--cr-card-border)] bg-[var(--cr-card)] px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/logo.png" alt="" className="h-8 w-8 shrink-0 object-contain lg:hidden" />
        <div className="min-w-0 lg:hidden">
          <p className="truncate text-[17px] font-semibold text-[var(--cr-ink)] lg:text-xl">{pageTitle}</p>
          <p className="hidden text-xs text-[var(--cr-ink-2)] sm:block lg:hidden">CounselReflect</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {isEvaluating ? (
          <span className="mr-1 flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            <Loader2 size={13} className="animate-spin" aria-hidden />
            Reviewing
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('cr:open-feedback'))}
          className="cr-control cr-focus flex h-9 w-9 items-center justify-center rounded-lg text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)] lg:hidden"
          aria-label="Send feedback"
        >
          <MessageCircle className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleDarkMode}
          className="cr-control cr-focus flex h-9 w-9 items-center justify-center rounded-lg text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
};
