import React from 'react';
import { LinkIcon } from 'lucide-react';
import { EMOTION_COLORS } from './emotionColors';
import { findMetricScore, getNotApplicableCopy } from './metricUtils';

/**
 * One consistent badge shape for EVERY score-cell output (numerical value,
 * categorical label, emotion, N/A, Conv). Quiet-chip form per design spec §3:
 * tinted bg, colored text, NO border, rounded-full, 12px/600. Only the color
 * tone varies — shape, size and weight stay identical so the column reads as
 * a set.
 */
const BADGE_BASE =
  'inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none min-w-[40px]';

const TONE = {
  good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  mid: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  bad: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  neutral: 'bg-[var(--cr-muted)] text-[var(--cr-ink-2)]'
};

const ScoreBadge: React.FC<{
  tone: string;
  title?: string;
  aggregated?: boolean;
  children: React.ReactNode;
}> = ({ tone, title, aggregated, children }) => (
  <div className="flex justify-center">
    <span className={`relative ${BADGE_BASE} ${tone}`} title={title}>
      {children}
      {aggregated && (
        <span
          className="absolute -top-2 -right-2 rounded-full border border-[var(--cr-card-border)] bg-[var(--cr-card)] p-0.5 text-[var(--cr-ink-3)]"
          title="Score based on aggregated chatbot turn"
        >
          <LinkIcon className="h-3 w-3" />
        </span>
      )}
    </span>
  </div>
);

/**
 * Render a score cell for a metric in the turn explorer table.
 * Handles numerical and categorical metrics with a single, unified badge style.
 */
export const renderScoreCell = (
  metricName: string,
  scoreItem: any,
  results: any
): React.ReactNode => {
  const s = findMetricScore(metricName, scoreItem);

  if (!s) {
    // Conversation-level metric: not scored per-turn.
    if (results.conversationMetrics?.[metricName]) {
      return <ScoreBadge tone={TONE.neutral} title="Conversation-level metric">Conv</ScoreBadge>;
    }
    // No data for this utterance-level metric — a quiet absence marker, not a badge.
    return <span className="select-none text-[0.8125rem] text-[var(--cr-ink-3)]">—</span>;
  }

  const aggregated = s.metadata?.aggregated;

  if (s.type === 'numerical') {
    if (s.value === -1) {
      return <ScoreBadge tone={TONE.neutral} title={getNotApplicableCopy(metricName).turnTitle}>N/A</ScoreBadge>;
    }
    const ratio = s.value / s.max_value; // normalized 0-1
    const isHigherBetter = s.direction !== 'lower_is_better'; // default: higher is better
    const tone = isHigherBetter
      ? (ratio >= 0.7 ? TONE.good : ratio >= 0.4 ? TONE.mid : TONE.bad)
      : (ratio <= 0.3 ? TONE.good : ratio <= 0.6 ? TONE.mid : TONE.bad);
    return <ScoreBadge tone={tone} aggregated={aggregated}>{s.value.toFixed(2)}</ScoreBadge>;
  }

  // Categorical
  if (s.label === '-1') {
    return <ScoreBadge tone={TONE.neutral} title={getNotApplicableCopy(metricName).turnTitle}>N/A</ScoreBadge>;
  }

  // Emotions keep their identity colors, but in the same quiet-chip shape.
  const emotion = s.label ? EMOTION_COLORS[s.label.toLowerCase()] : undefined;
  if (emotion) {
    return (
      <ScoreBadge tone={`${emotion.bg} ${emotion.text}`} aggregated={aggregated}>
        {s.label}
      </ScoreBadge>
    );
  }

  // Quality-style categorical labels → same green/amber/red semantics as numerical.
  let tone = TONE.neutral;
  if (['High', 'Change', 'Safe'].includes(s.label)) tone = TONE.good;
  else if (['Medium'].includes(s.label)) tone = TONE.mid;
  else if (['Low', 'Sustain', 'Toxic'].includes(s.label)) tone = TONE.bad;

  return <ScoreBadge tone={tone} aggregated={aggregated}>{s.label}</ScoreBadge>;
};
