import type {
  MetricPresentationSnapshot,
  MetricScore,
  UtteranceScore,
} from '@shared/types';
import {
  prettifyMetricName,
  resolveMetricPresentation,
} from '@shared/utils/metricPresentation';

export type ExtensionMetricScore = MetricScore & {
  confidence?: number;
  all_attributes?: Record<string, number>;
  metadata?: Record<string, unknown>;
};

export type TurnMetricItem = {
  key: string;
  label: string;
  score: ExtensionMetricScore;
  presentation?: MetricPresentationSnapshot;
  reasoning?: string;
  childScores?: Array<{
    key: string;
    label: string;
    score: ExtensionMetricScore;
  }>;
};

export const isNotApplicable = (score: ExtensionMetricScore): boolean =>
  (score.type === 'numerical' && score.value === -1) ||
  ['-1', 'n/a', 'not applicable'].includes(String(score.label || '').toLowerCase());

export const conciseNumber = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

export const scoreText = (score: ExtensionMetricScore): string => {
  if (isNotApplicable(score)) return 'Not applicable';
  if (score.type === 'numerical') {
    return typeof score.max_value === 'number' && score.max_value > 0
      ? `${conciseNumber(score.value)} / ${conciseNumber(score.max_value)}`
      : conciseNumber(score.value);
  }
  return score.label || 'No score';
};

export const scoreTone = (
  score: ExtensionMetricScore,
  presentation?: MetricPresentationSnapshot,
): string => {
  if (isNotApplicable(score)) return 'bg-[var(--cr-muted)] text-[var(--cr-ink-2)]';

  const label = String(score.label || '').toLowerCase();
  if (label === 'toxic') {
    return 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300';
  }
  if (label === 'safe') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  }

  if (score.type === 'numerical' && score.max_value > 0) {
    const direction = score.direction || presentation?.direction;
    if (!direction) {
      return 'bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200';
    }

    const ratio = score.value / score.max_value;
    const favorable = direction === 'higher_is_better' ? ratio >= 0.7 : ratio <= 0.3;
    const concerning = direction === 'higher_is_better' ? ratio < 0.4 : ratio > 0.6;
    if (favorable) {
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
    }
    if (concerning) {
      return 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300';
    }
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  }

  // Nominal categories such as Change/Sustain and emotion labels describe a
  // class rather than good/bad performance, so they remain neutral.
  return 'bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200';
};

const aggregationExplanation = (score: ExtensionMetricScore): string => {
  if (!score.metadata?.aggregated) return '';
  const totalParts = Number(score.metadata.total_parts);
  return Number.isFinite(totalParts) && totalParts > 1
    ? ` This score covers ${totalParts} consecutive turns.`
    : ' This score covers multiple consecutive turns.';
};

export const resultExplanation = (
  score: ExtensionMetricScore,
  presentation?: MetricPresentationSnapshot,
): string => {
  if (isNotApplicable(score)) {
    return 'This construct did not apply to this turn, so no score was assigned.';
  }
  if (presentation?.outputKind === 'span') {
    return 'This evaluator returns a possible text span rather than a performance score.';
  }
  if (score.type === 'numerical') {
    const scale = presentation?.scaleLabel || `0–${conciseNumber(score.max_value)} scale`;
    const direction = score.direction || presentation?.direction;
    const directionCopy = direction === 'higher_is_better'
      ? ' Higher values indicate more of the measured construct.'
      : direction === 'lower_is_better'
        ? ' Lower values indicate less of the flagged construct.'
        : ' The metric does not specify a good/bad direction.';
    return `The result is ${scoreText(score)} on its ${scale}.${directionCopy}${aggregationExplanation(score)}`;
  }

  const labels = presentation?.outputLabels?.filter(Boolean) || [];
  const categoryCopy = labels.length > 0
    ? `This is a model or rubric category from: ${labels.join(', ')}. It is not a percentage.`
    : 'This is a categorical result, not a percentage or an overall judgment of the conversation.';
  return `${categoryCopy}${aggregationExplanation(score)}`;
};

export const buildTurnMetricItems = (
  scoreItem: Pick<UtteranceScore, 'metrics' | 'reasoning'>,
  presentationById: Readonly<Record<string, MetricPresentationSnapshot>>,
): TurnMetricItem[] => {
  const entries = Object.entries(scoreItem.metrics) as Array<[string, ExtensionMetricScore]>;
  const toxicityEntries = entries.filter(([key]) =>
    resolveMetricPresentation(key, presentationById)?.parentId === 'toxicity'
  );
  const toxicityKeys = new Set(toxicityEntries.map(([key]) => key));
  const items: TurnMetricItem[] = [];

  if (toxicityEntries.length > 0) {
    const summary = toxicityEntries.find(([key]) => key === 'is_toxic') ||
      toxicityEntries.find(([key]) => key === 'toxicity_toxicity') ||
      toxicityEntries[0];
    const parent = presentationById.toxicity ||
      resolveMetricPresentation(summary[0], presentationById);

    items.push({
      key: 'toxicity',
      label: parent?.label || 'Toxicity',
      score: summary[1],
      presentation: parent,
      reasoning: scoreItem.reasoning?.toxicity || scoreItem.reasoning?.[summary[0]],
      childScores: toxicityEntries
        .filter(([key, score]) =>
          key !== 'is_toxic' && key !== 'primary_category' && score.type === 'numerical'
        )
        .map(([key, score]) => ({
          key,
          label: resolveMetricPresentation(key, presentationById)?.label || prettifyMetricName(key),
          score,
        })),
    });
  }

  entries.forEach(([key, score]) => {
    if (toxicityKeys.has(key)) return;
    const presentation = resolveMetricPresentation(key, presentationById);
    items.push({
      key,
      label: presentation?.label || prettifyMetricName(key),
      score,
      presentation,
      reasoning: scoreItem.reasoning?.[key] ||
        (presentation?.parentId ? scoreItem.reasoning?.[presentation.parentId] : undefined),
    });
  });

  return items;
};

export const getScoredTurnIndexes = (utteranceScores: UtteranceScore[]): number[] =>
  utteranceScores.reduce<number[]>((indexes, scoreItem, index) => {
    if (Object.keys(scoreItem.metrics || {}).length > 0) indexes.push(index);
    return indexes;
  }, []);
