import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@shared/context';

export const Header: React.FC = () => {
  const { isDarkMode, toggleDarkMode } = useTheme();
  
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--cr-card-border)] bg-[var(--cr-bg)] transition-colors duration-300">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/logo.png"
            alt="CounselReflect"
            className="h-8 w-8 shrink-0 object-contain"
          />
          <h1 className="cr-brand truncate text-[17px] text-[var(--cr-ink)]">CounselReflect</h1>
        </div>

        <button
          onClick={toggleDarkMode}
          className="cr-control cr-focus rounded-full p-2 text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
          aria-label="Toggle dark mode"
        >
          {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>
    </header>
  );
};
