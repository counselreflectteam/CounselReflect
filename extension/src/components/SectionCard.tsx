import React from 'react';

interface SectionCardProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  status?: React.ReactNode;
  /** Cobalt-signal slab surface for the ONE accent module in the sidebar. */
  accent?: boolean;
  /** Semantic entrance motion; pass an empty string when a parent owns it. */
  motionClassName?: string;
  children: React.ReactNode;
}

/* L2 MODULE — borderless muted surface (cr-module) for one self-contained
   tool block. Wayfinding renders inside the module top: numbered step
   eyebrow, 16px/700 title, optional one-line description; the status sits
   on the title's baseline as typography (never a pill). Module exception to
   the zone-opener recipe: the module edge is already the threshold, so the
   header is the same type stack WITHOUT .cr-opener (no rule, no overscore). */
export const SectionCard: React.FC<SectionCardProps> = ({
  eyebrow,
  title,
  subtitle,
  status,
  accent,
  motionClassName = 'cr-enter',
  children
}) => {
  return (
    <section className={`${motionClassName} p-4 ${accent ? 'cr-module-accent' : 'cr-module'}`}>
      {eyebrow && <span className="cr-eyebrow">{eyebrow}</span>}
      <div className={`flex items-baseline justify-between gap-3 ${eyebrow ? 'mt-2' : ''}`}>
        <h2
          className={`min-w-0 text-base font-bold leading-6 tracking-tight ${
            accent ? 'text-[var(--cr-slab-ink)]' : 'text-[var(--cr-ink)]'
          }`}
        >
          {title}
        </h2>
        {status}
      </div>
      {subtitle && (
        <p
          className={`mt-1 text-[0.8125rem] leading-snug ${
            accent ? 'text-[var(--cr-slab-ink-2)]' : 'text-[var(--cr-ink-2)]'
          }`}
        >
          {subtitle}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
};
