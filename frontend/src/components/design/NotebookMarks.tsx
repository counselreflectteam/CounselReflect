import React from 'react';

type MarkProps = {
  className?: string;
};

export const PencilRule: React.FC<MarkProps> = ({ className = '' }) => (
  <svg viewBox="0 0 640 10" preserveAspectRatio="none" className={className} fill="none" aria-hidden>
    <path d="M2 4.7c95-1.7 182 .8 279-.1 125-1.1 236-1 357 .2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M15 7.3c78-1 170 .5 248-.2 121-1 237-.4 360 .3" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" opacity=".3" />
  </svg>
);

export const PencilUnderline: React.FC<MarkProps> = ({ className = '' }) => (
  <svg viewBox="0 0 520 14" preserveAspectRatio="none" className={className} fill="none" aria-hidden>
    <path d="M3 6.9c58-2.4 119-1.1 177-.5 83 .8 164-2.2 337-.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M23 10.5c82-1.6 174-.8 254-.9 75-.1 147-1.4 217-.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".34" />
  </svg>
);

export const SketchArrow: React.FC<MarkProps> = ({ className = 'h-4 w-5' }) => (
  <svg viewBox="0 0 24 16" fill="none" className={className} aria-hidden>
    <path d="M2.2 8.4c4.2-.3 8.5-.4 14.8-.2M13.8 3.4c1.8 1.7 3.6 3.2 5.2 4.7-1.7 1.5-3.2 3.1-4.8 4.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MarkFrame: React.FC<MarkProps & { children: React.ReactNode; viewBox?: string }> = ({
  className = 'h-14 w-14',
  children,
  viewBox = '0 0 64 64'
}) => (
  <svg viewBox={viewBox} fill="none" className={className} aria-hidden>
    <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{children}</g>
  </svg>
);

export const TranscriptSketch: React.FC<MarkProps> = ({ className }) => (
  <MarkFrame className={className}>
    <path d="M14 6.8c11-.5 24.7-.1 34.9.8 1 13.8.7 32.2-.7 48.2-11.2.8-23.3.4-34.4-.8-.8-16.8-.7-33.3.2-48.2Z" strokeWidth="1.8" />
    <path d="M21 19.2c7.6-.5 14.8-.3 21.8.4M20.8 29c5.4-.4 10.5-.2 15.5.2M20.7 39.2c8.5-.5 16.2-.3 22.8.4M20.8 48.4c4.9-.3 9.5-.2 13.9.2" strokeWidth="1.45" />
    <path d="M19.8 31.7c8.7-1 16.1-.9 23.4-.1" strokeWidth="4.2" opacity=".6" />
  </MarkFrame>
);

export const MeasuresSketch: React.FC<MarkProps> = ({ className }) => (
  <MarkFrame className={className}>
    <path d="M10 12.2c13.4-.8 27.7-.4 43.5.7M10.2 30.8c14-.5 28.3-.2 43 .7M10.1 49c13.7-.5 28-.2 43.2.6" strokeWidth="1.55" />
    <path d="M19.6 7.1c1.1 3.2 1 6.8-.2 10.5M39.8 25.7c1 3.1.9 6.7-.3 10.4M27.8 43.9c1 3.1.9 6.7-.2 10.3" strokeWidth="2" />
    <path d="M17.2 7.8c1.5-1.2 3.4-1.3 5.1-.2M37.4 26.4c1.5-1.2 3.4-1.2 5-.1M25.4 44.6c1.5-1.2 3.5-1.2 5.1-.1" strokeWidth="1.15" opacity=".55" />
  </MarkFrame>
);

export const EvidenceSketch: React.FC<MarkProps> = ({ className }) => (
  <MarkFrame className={className}>
    <path d="M11.4 10.5c9.4-.5 19.5-.3 29.1.4.7 9.3.5 19.3-.6 28.7-9.2.7-18.8.4-28.1-.5-.8-9.5-.9-19-.4-28.6Z" strokeWidth="1.6" />
    <path d="M17.8 19.1c5.6-.3 11-.2 16.4.2M17.7 27.3c4.2-.3 8.3-.2 12.3.2" strokeWidth="1.4" />
    <path d="M34.2 34.6c5.2-4.8 13.7-4.2 17.9 1.2 4.1 5.3 2.2 13-3.5 16.1-5.2 2.8-12 .8-14.7-4.5-2.1-4.2-1.9-9.5.3-12.8Z" strokeWidth="2" />
    <path d="M50.4 50.5c2.5 2.1 4.8 4.3 7.1 6.7" strokeWidth="2.5" />
    <path d="M38.3 41.6c2.4-1 5.2-1.3 7.8-.7" strokeWidth="1.35" opacity=".55" />
  </MarkFrame>
);

export const PaperSketch: React.FC<MarkProps> = ({ className }) => (
  <MarkFrame className={className}>
    <path d="M12.5 13.4c12.1-1.1 25.2-.8 37.8.5.5 11.2.2 22.4-1 33.3-12 1-24.3.8-36.7-.5-.7-11.1-.8-22.3-.1-33.3Z" strokeWidth="1.8" />
    <path d="M17.4 9.2c12.2-1.1 25.5-.6 38.8.9.6 10.2.4 20.2-.5 30.1M8.8 18.4c-.4 10.5-.1 20.8.8 30.5 10.8 1.4 21.6 1.8 32.5 1.2" strokeWidth="1.25" opacity=".55" />
    <path d="M20.2 23.3c6.4-.4 13.2-.3 20.1.3M19.8 31.2c8.2-.4 16.3-.2 23.8.5M20 39.1c5.1-.2 10-.1 14.8.3" strokeWidth="1.5" />
  </MarkFrame>
);

export const KeySketch: React.FC<MarkProps> = ({ className }) => (
  <MarkFrame className={className}>
    <path d="M14.2 29.2c3.5-7.4 14.5-8.5 19.3-2 4.3 5.7 1 14.3-5.8 15.7-5.8 1.2-11.7-2.1-13.6-7.5-.7-2-.7-4.2.1-6.2Z" strokeWidth="2" />
    <path d="M34 38.4c7.1 4.1 13.8 8.3 20 12.7M43.2 44c-1.8 2.4-3.4 4.9-4.9 7.5M49.1 47.6c-1.3 1.9-2.5 3.9-3.6 6" strokeWidth="2.2" />
    <path d="M21.8 31.1c1.4-1.8 4.1-2.3 6-.8" strokeWidth="1.25" opacity=".55" />
  </MarkFrame>
);
