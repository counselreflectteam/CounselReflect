import React from 'react';
import { ALargeSmall, Check, FileBarChart, Moon, Sun } from 'lucide-react';
import { useTheme } from '@shared/context';
import {
  TEXT_SCALE_OPTIONS,
  getStoredTextScaleStep,
  setTextScaleStep,
  type TextScaleStep
} from '../utils/textScale';

interface HeaderProps {
  hasReport?: boolean;
  onViewReport?: () => void;
}

/* Fixed-px preview glyphs: each "A" shows its option's absolute size, so they
   must NOT ride the root-font-size scale like the rest of the type system. */
const PREVIEW_GLYPH_PX: Record<TextScaleStep, number> = {
  default: 13,
  large: 15,
  xl: 17
};

const TextSizeMenu: React.FC = () => {
  const [step, setStep] = React.useState<TextScaleStep>(getStoredTextScaleStep);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  // Another sidebar instance (a second tab shares the extension origin's
  // localStorage) may change the preference; keep this menu's state honest.
  // initTextScale's own 'storage' listener re-applies the root font-size.
  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'textScale' || event.key === null) {
        setStep(getStoredTextScaleStep());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // Clicks on the HOST page never reach this iframe's document; the frame
    // losing focus is the only signal we get, so treat it as outside-click.
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', close);
    };
  }, [open]);

  const selectStep = (next: TextScaleStep) => {
    setStep(next);
    setTextScaleStep(next);
    // Stays open so sizes can be compared; outside click / Escape dismisses.
  };

  // ARIA radio pattern: arrows move selection (selection follows focus).
  const onGroupKeyDown = (event: React.KeyboardEvent) => {
    const count = TEXT_SCALE_OPTIONS.length;
    const current = TEXT_SCALE_OPTIONS.findIndex((option) => option.step === step);
    let next = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % count;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (current - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    if (next === -1) return;
    event.preventDefault();
    selectStep(TEXT_SCALE_OPTIONS[next].step);
    optionRefs.current[next]?.focus();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`cr-control cr-focus shrink-0 rounded-full p-2 hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)] ${
          open ? 'bg-[var(--cr-muted)] text-[var(--cr-ink)]' : 'text-[var(--cr-ink-2)]'
        }`}
        aria-label="Text size"
        aria-expanded={open}
        aria-controls={open ? 'cr-text-size-menu' : undefined}
      >
        <ALargeSmall className="h-[18px] w-[18px]" aria-hidden />
      </button>

      {open && (
        <div
          id="cr-text-size-menu"
          role="radiogroup"
          aria-label="Text size"
          onKeyDown={onGroupKeyDown}
          className="cr-card cr-enter absolute right-0 top-full z-50 mt-1.5 w-44 p-1.5 shadow-[var(--shadow-lift)]"
        >
          <p className="cr-eyebrow px-2.5 pb-1 pt-1.5">Text size</p>
          {TEXT_SCALE_OPTIONS.map((option, index) => {
            const active = option.step === step;
            return (
              <button
                key={option.step}
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => selectStep(option.step)}
                className="cr-interactive-row cr-focus flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--cr-muted)]"
              >
                <span
                  aria-hidden
                  className="w-5 shrink-0 text-center font-semibold leading-none text-[var(--cr-ink)]"
                  style={{ fontSize: `${PREVIEW_GLYPH_PX[option.step]}px` }}
                >
                  A
                </span>
                <span className={`text-[0.8125rem] ${active ? 'font-semibold text-[var(--cr-ink)]' : 'text-[var(--cr-ink-2)]'}`}>
                  {option.label}
                </span>
                {active && (
                  <Check
                    className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--color-brand-600)] dark:text-[var(--color-brand-400)]"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({ hasReport = false, onViewReport }) => {
  const { isDarkMode, toggleDarkMode } = useTheme();

  return (
    <header className="cr-glass z-50 flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5 transition-colors duration-300">
      <div className="flex min-w-0 items-center gap-2">
        <img src="/logo.png" alt="" className="h-6 w-6 shrink-0" />
        <h1 className="cr-brand truncate text-base text-[var(--cr-ink)]">
          CounselReflect
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {hasReport && onViewReport && (
          <button
            type="button"
            onClick={onViewReport}
            className="cr-btn cr-btn-ghost cr-focus h-8 px-2 text-xs"
          >
            <FileBarChart className="h-4 w-4" aria-hidden />
            View report
          </button>
        )}
        <TextSizeMenu />
        <button
          type="button"
          onClick={toggleDarkMode}
          className="cr-control cr-focus shrink-0 rounded-full p-2 text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode
            ? <Sun className="h-[18px] w-[18px]" aria-hidden />
            : <Moon className="h-[18px] w-[18px]" aria-hidden />}
        </button>
      </div>
    </header>
  );
};
