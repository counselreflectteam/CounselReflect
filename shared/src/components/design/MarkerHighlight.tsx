import React from 'react';
import type { TargetSpeaker } from '../../types';

export type MarkerTone = 'yellow' | 'cyan' | 'blue' | 'coral' | 'mint' | 'lavender';

interface MarkerHighlightProps {
  children: React.ReactNode;
  tone?: MarkerTone;
  wrap?: boolean;
  className?: string;
}

const TONE_CLASSES = {
  yellow: '[--cr-marker-color:#FFE66D] dark:[--cr-marker-color:#8A6B00]',
  cyan: '[--cr-marker-color:#91ECF5] dark:[--cr-marker-color:#126875]',
  blue: '[--cr-marker-color:#A9C8FF] dark:[--cr-marker-color:#244A81]',
  coral: '[--cr-marker-color:#FFB4A8] dark:[--cr-marker-color:#7A332E]',
  mint: '[--cr-marker-color:#A7E8C8] dark:[--cr-marker-color:#235F4B]',
  lavender: '[--cr-marker-color:#D8C4FF] dark:[--cr-marker-color:#573C7A]'
} satisfies Record<MarkerTone, string>;

const TARGET_TONES: Record<TargetSpeaker, MarkerTone> = {
  therapist: 'blue',
  patient: 'coral',
  both: 'lavender'
};

export const getTargetMarkerTone = (target: TargetSpeaker): MarkerTone => TARGET_TONES[target];

/** A compact, uneven marker stroke for short phrases that need attention. */
export const MarkerHighlight: React.FC<MarkerHighlightProps> = ({
  children,
  tone = 'yellow',
  wrap = false,
  className = ''
}) => {
  if (wrap) {
    return (
      <mark
        className={`box-decoration-clone whitespace-normal bg-transparent px-[0.08em] text-inherit dark:text-[var(--cr-ink)] ${TONE_CLASSES[tone]} ${className}`}
        data-marker-highlight={tone}
        style={{
          backgroundImage: 'linear-gradient(177deg, transparent 18%, color-mix(in srgb, var(--cr-marker-color) 75%, transparent) 20%, color-mix(in srgb, var(--cr-marker-color) 75%, transparent) 86%, transparent 88%)',
          WebkitBoxDecorationBreak: 'clone'
        }}
      >
        {children}
      </mark>
    );
  }

  return (
    <mark
      className={`relative isolate inline-block whitespace-nowrap bg-transparent px-[0.08em] text-inherit dark:text-[var(--cr-ink)] ${TONE_CLASSES[tone]} ${className}`}
      data-marker-highlight={tone}
    >
      <span
        aria-hidden="true"
        className="absolute -inset-x-[0.14em] bottom-[0.02em] -z-10 h-[0.72em] -rotate-[0.7deg] bg-[var(--cr-marker-color)] opacity-75"
        style={{ clipPath: 'polygon(1% 18%, 98% 4%, 100% 82%, 4% 97%)' }}
      />
      {children}
    </mark>
  );
};
