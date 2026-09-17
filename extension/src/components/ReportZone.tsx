import React from 'react';
import { ChevronDown } from 'lucide-react';

interface ReportZoneProps {
  id: string;
  eyebrow: string;
  title: string;
  /** One-line function statement, shown while the zone is closed. */
  purpose: string;
  /** Live stat rendered right-aligned on the closed row (e.g. "12/12 ✓"). */
  stat?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * A collapsible report zone. The body is hidden, never unmounted, so zone
 * contents keep their live state (chat thread, chart selections, host-page
 * highlight effects). Closed zones read as one row: what this zone DOES plus
 * a live stat. scroll-mt keeps jump targets clear of the sticky ReportNav.
 */
export const ReportZone: React.FC<ReportZoneProps> = ({
  id,
  eyebrow,
  title,
  purpose,
  stat,
  open,
  onToggle,
  children
}) => {
  const bodyId = `report-zone-${id}`;

  const handleToggle = () => {
    onToggle();
    if (!open && typeof window.requestAnimationFrame === 'function') {
      // Recharts' ResponsiveContainer measures 0 while hidden; nudge it to
      // re-measure right after the body becomes visible.
      window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }
  };

  return (
    <section id={`report-zone-section-${id}`} className="scroll-mt-[60px] pb-10">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="cr-zone-head cr-focus cr-opener group/zone"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="cr-eyebrow">{eyebrow}</span>
            <span className="cr-section-title mt-1 block text-lg md:text-xl">{title}</span>
            {!open && (
              <span className="mt-1 block text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">{purpose}</span>
            )}
          </span>
          <span className="mt-1 flex shrink-0 items-center gap-2.5">
            {!open && stat}
            <ChevronDown
              className={`cr-zone-chevron h-4 w-4 text-[var(--cr-ink-3)] ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </span>
        </span>
      </button>
      <div id={bodyId} hidden={!open} className="mt-5">
        {children}
      </div>
    </section>
  );
};
