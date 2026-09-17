import React from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X } from 'lucide-react';
import { LiteratureMetric } from '../../services/literatureMetricsService';
import { TargetSpeakerBadge } from '../../utils/targetSpeakerUtils';

interface LiteratureMetricDetailModalProps {
  metric: LiteratureMetric;
  onClose: () => void;
}

export const LiteratureMetricDetailModal: React.FC<LiteratureMetricDetailModalProps> = ({
  metric,
  onClose
}) => {
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${metric.metricName} details`}
      onClick={onClose}
    >
      <div
        className="cr-card max-h-[90vh] w-full max-w-3xl overflow-y-auto shadow-[var(--shadow-lift)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between border-b border-[var(--cr-card-border)] bg-[var(--cr-card)] p-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="cr-section-title">
                {metric.metricName}
              </h3>
              <TargetSpeakerBadge target={metric.target} />
            </div>
            <p className="cr-meta mt-1">
              {metric.references?.length || 0} references
              {metric.category ? ` · ${metric.category}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close metric details"
            className="cr-focus ml-4 rounded-full p-2 text-[var(--cr-ink-3)] transition-colors hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Definition */}
          <div>
            <h4 className="mb-2 text-sm font-bold text-[var(--cr-ink)]">
              Definition
            </h4>
            <p className="text-sm leading-relaxed text-[var(--cr-ink)]">
              {metric.definition}
            </p>
          </div>

          {/* Rationale */}
          <div className="border-t border-[var(--cr-card-border)] pt-6">
            <h4 className="mb-2 text-sm font-bold text-[var(--cr-ink)]">Rationale</h4>
            <p className="text-sm leading-relaxed text-[var(--cr-ink-2)]">
              {metric.whyThisMatters}
            </p>
          </div>

          {/* Level descriptions */}
          {(metric.level1Description || metric.level3Description || metric.level5Description) && (
            <div className="border-t border-[var(--cr-card-border)] pt-6">
              <h4 className="mb-3 text-sm font-bold text-[var(--cr-ink)]">
                Scoring details
              </h4>
              <div className="space-y-4">
                {metric.level1Description && (
                  <div className="grid gap-2 sm:grid-cols-[72px_minmax(0,1fr)] sm:items-start">
                    <span className="cr-chip justify-self-start whitespace-nowrap">Level 1</span>
                    <p className="m-0 text-sm leading-relaxed text-[var(--cr-ink-2)]">{metric.level1Description}</p>
                  </div>
                )}
                {metric.level3Description && (
                  <div className="grid gap-2 sm:grid-cols-[72px_minmax(0,1fr)] sm:items-start">
                    <span className="cr-chip justify-self-start whitespace-nowrap">Level 3</span>
                    <p className="m-0 text-sm leading-relaxed text-[var(--cr-ink-2)]">{metric.level3Description}</p>
                  </div>
                )}
                {metric.level5Description && (
                  <div className="grid gap-2 sm:grid-cols-[72px_minmax(0,1fr)] sm:items-start">
                    <span className="cr-chip justify-self-start whitespace-nowrap">Level 5</span>
                    <p className="m-0 text-sm leading-relaxed text-[var(--cr-ink-2)]">{metric.level5Description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* References */}
          {metric.references && metric.references.length > 0 && (
            <div className="border-t border-[var(--cr-card-border)] pt-6">
              <h4 className="mb-1 text-sm font-bold text-[var(--cr-ink)]">
                References
              </h4>
              <div className="divide-y divide-[var(--cr-card-border)]">
                {metric.references.map((ref: string, idx: number) => (
                  <a
                    key={idx}
                    href={ref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cr-focus group flex items-center gap-3 rounded-md py-2.5"
                  >
                    <span className="text-xs tabular-nums text-[var(--cr-ink-3)]">
                      [{idx + 1}]
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-brand-600 group-hover:underline dark:text-brand-400">
                      {ref}
                    </span>
                    <ExternalLink className="h-4 w-4 flex-shrink-0 text-[var(--cr-ink-3)] transition-colors group-hover:text-[var(--cr-ink)]" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
