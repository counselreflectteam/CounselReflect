import React from 'react';

export interface ReportNavZone {
  id: string;
  label: string;
  open: boolean;
}

interface ReportNavProps {
  zones: ReportNavZone[];
  onJump: (id: string) => void;
}

/**
 * Sticky one-word jump chips for the report zones. A chip opens its zone if
 * closed, then scrolls to it. Ink weight mirrors the zone's open state — no
 * scroll-spy observers.
 */
export const ReportNav: React.FC<ReportNavProps> = ({ zones, onJump }) => (
  <nav aria-label="Report sections" className="cr-report-nav">
    {zones.map((zone) => (
      <button
        key={zone.id}
        type="button"
        onClick={() => onJump(zone.id)}
        className={`cr-focus min-h-[32px] truncate rounded-md px-1 text-xs transition-colors hover:bg-[var(--cr-muted)] ${
          zone.open
            ? 'font-semibold text-[var(--cr-ink)]'
            : 'font-medium text-[var(--cr-ink-2)]'
        }`}
      >
        {zone.label}
      </button>
    ))}
  </nav>
);
