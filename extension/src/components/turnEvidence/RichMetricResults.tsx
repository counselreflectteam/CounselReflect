import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { MetricPresentationSnapshot, UtteranceScore } from '@shared/types';
import { prettifyMetricName } from '@shared/utils/metricPresentation';
import {
  buildTurnMetricItems,
  conciseNumber,
  resultExplanation,
  scoreText,
  scoreTone,
  type TurnMetricItem,
} from './turnMetricModel';

interface RichMetricResultsProps {
  scoreItem: UtteranceScore;
  presentationById: Readonly<Record<string, MetricPresentationSnapshot>>;
}

const targetLabel = (target: MetricPresentationSnapshot['target']): string | null => {
  if (target === 'therapist') return 'Chatbot turns';
  if (target === 'patient') return 'Client turns';
  if (target === 'both') return 'All turns';
  return null;
};

const MetricDetails: React.FC<{ metric: TurnMetricItem }> = ({ metric }) => {
  const { presentation, score } = metric;
  const attributes = score.all_attributes && Object.entries(score.all_attributes);

  return (
    <div className="space-y-3 border-t border-[var(--cr-rule-on-muted)] px-3 pb-3 pt-3 text-xs leading-5">
      <section>
        <p className="font-semibold text-[var(--cr-ink)]">What this measures</p>
        <p className="mt-1 text-[var(--cr-ink-2)]">
          {presentation?.shortDefinition || 'Definition unavailable for this restored run.'}
        </p>
        {presentation?.target && (
          <p className="mt-1 text-[var(--cr-ink-2)]">
            <span className="font-semibold text-[var(--cr-ink)]">Evaluated on:</span>{' '}
            {targetLabel(presentation.target)}
          </p>
        )}
      </section>

      <section>
        <p className="font-semibold text-[var(--cr-ink)]">How to read this result</p>
        <p className="mt-1 text-[var(--cr-ink-2)]">
          {resultExplanation(score, presentation)}
        </p>
      </section>

      {presentation?.anchors && presentation.anchors.length > 0 && (
        <section>
          <p className="font-semibold text-[var(--cr-ink)]">Scoring anchors</p>
          <dl className="mt-1 space-y-1.5">
            {presentation.anchors.map((anchor) => (
              <div key={anchor.label} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2">
                <dt className="font-semibold text-[var(--cr-ink)]">{anchor.label}</dt>
                <dd className="text-[var(--cr-ink-2)]">{anchor.description}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {metric.reasoning && (
        <section>
          <p className="font-semibold text-[var(--cr-ink)]">Why this result</p>
          <p className="mt-1 text-[var(--cr-ink-2)]">{metric.reasoning}</p>
        </section>
      )}

      {presentation?.confidenceMeaning && typeof score.confidence === 'number' && (
        <p className="text-[var(--cr-ink-2)]">
          <span className="font-semibold text-[var(--cr-ink)]">
            {presentation.confidenceMeaning}:
          </span>{' '}
          {(score.confidence * 100).toFixed(0)}%
        </p>
      )}

      {metric.childScores && metric.childScores.length > 0 && (
        <section>
          <p className="font-semibold text-[var(--cr-ink)]">Independent dimensions</p>
          <div className="mt-1.5 space-y-1.5">
            {metric.childScores.map((child) => (
              <div key={child.key} className="flex items-center justify-between gap-3">
                <span className="text-[var(--cr-ink-2)]">{child.label}</span>
                <span className="font-mono font-semibold tabular-nums text-[var(--cr-ink)]">
                  {scoreText(child.score)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {attributes && attributes.length > 0 && (
        <section>
          <p className="font-semibold text-[var(--cr-ink)]">Independent attributes</p>
          <div className="mt-1.5 space-y-1.5">
            {attributes.map(([name, value]) => (
              <div key={name} className="flex items-center justify-between gap-3">
                <span className="text-[var(--cr-ink-2)]">{prettifyMetricName(name)}</span>
                <span className="font-mono font-semibold tabular-nums text-[var(--cr-ink)]">
                  {conciseNumber(value)} / 1
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {presentation?.caution && (
        <section className="border-l-2 border-amber-400 pl-2">
          <p className="font-semibold text-[var(--cr-ink)]">Keep in mind</p>
          <p className="mt-1 text-[var(--cr-ink-2)]">{presentation.caution}</p>
        </section>
      )}

      {(presentation?.definition || presentation?.whyItMatters || presentation?.sourceLabel) && (
        <details>
          <summary className="cr-focus cursor-pointer rounded-sm font-semibold text-brand-700 dark:text-brand-300">
            Method &amp; source
          </summary>
          <div className="mt-2 space-y-2 text-[var(--cr-ink-2)]">
            {presentation?.sourceType && (
              <p>
                <strong className="text-[var(--cr-ink)]">Method:</strong>{' '}
                {presentation.sourceType === 'predefined'
                  ? 'Trained or deterministic predefined evaluator'
                  : presentation.sourceType === 'literature'
                    ? 'Literature-derived rubric scored for this run'
                    : 'User-defined metric scored for this run'}
              </p>
            )}
            {presentation.definition && <p>{presentation.definition}</p>}
            {presentation.whyItMatters && (
              <p>
                <strong className="text-[var(--cr-ink)]">Why it matters:</strong>{' '}
                {presentation.whyItMatters}
              </p>
            )}
            {presentation.sourceUrl ? (
              <a
                href={presentation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cr-link cr-focus inline-flex rounded-sm"
              >
                {presentation.sourceLabel || 'Open research source'}
              </a>
            ) : presentation.sourceLabel ? (
              <p>{presentation.sourceLabel}</p>
            ) : null}
          </div>
        </details>
      )}
    </div>
  );
};

export const RichMetricResults: React.FC<RichMetricResultsProps> = ({
  scoreItem,
  presentationById,
}) => {
  const [expandedMetric, setExpandedMetric] = React.useState<string | null>(null);
  const metricItems = React.useMemo(
    () => buildTurnMetricItems(scoreItem, presentationById),
    [presentationById, scoreItem],
  );

  React.useEffect(() => {
    if (expandedMetric && !metricItems.some((metric) => metric.key === expandedMetric)) {
      setExpandedMetric(null);
    }
  }, [expandedMetric, metricItems]);

  if (metricItems.length === 0) {
    return (
      <div className="cr-panel p-4 text-sm text-[var(--cr-ink-2)]">
        This turn did not receive any metric-level output.
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-[var(--cr-ink-2)]">
        {metricItems.length} metric result{metricItems.length === 1 ? '' : 's'}
      </p>
      <div className="mt-2 space-y-2">
        {metricItems.map((metric) => {
          const expanded = expandedMetric === metric.key;
          const panelId = `turn-evidence-metric-${metric.key.replace(/[^a-z0-9_-]/gi, '-')}`;
          return (
            <article key={metric.key} className="cr-well overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedMetric(expanded ? null : metric.key)}
                className="cr-focus flex w-full items-start gap-3 px-3 py-3 text-left"
                aria-expanded={expanded}
                aria-controls={panelId}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] font-bold text-[var(--cr-ink)]">
                    {metric.label}
                  </span>
                  <span className="mt-1 block text-xs leading-4 text-[var(--cr-ink-2)]">
                    {metric.presentation?.shortDefinition || 'Open for result details.'}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${scoreTone(metric.score, metric.presentation)}`}
                >
                  {scoreText(metric.score)}
                </span>
                <ChevronDown
                  className={`mt-1 h-4 w-4 shrink-0 text-[var(--cr-ink-3)] transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
              {expanded && (
                <div id={panelId}>
                  <MetricDetails metric={metric} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};
