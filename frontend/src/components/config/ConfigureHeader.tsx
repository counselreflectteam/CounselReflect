import React from 'react';
import { EvaluationStatus } from '@shared/types';
import { EvaluationLoadingMark, EvaluationProgress } from '@shared/components/config';
import type { EvaluationPhase, ProgressState } from '@shared/utils/evaluationUtils';
import { MeasuresSketch, PencilRule, PencilUnderline } from '../design/NotebookMarks';

interface ConfigureHeaderProps {
  isEvaluating: boolean;
  isCancelling: boolean;
  status: EvaluationStatus;
  totalSelectedMetrics: number;
  progress: ProgressState;
  phasesToRun: EvaluationPhase[];
  phaseCounts: {
    predefined: number;
    custom: number;
    literature: number;
  };
  onCancel: () => void;
}

/**
 * Header section for the configure page; shows run progress while evaluating
 */
export const ConfigureHeader: React.FC<ConfigureHeaderProps> = ({
  isEvaluating,
  isCancelling,
  totalSelectedMetrics,
  progress,
  phasesToRun,
  phaseCounts,
  onCancel
}) => {
  if (!isEvaluating) {
    return (
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_84px] sm:items-start">
        <div>
          <p className="cr-kicker">Evaluation setup</p>
          <h1 className="cr-page-title mt-2 text-[30px] text-[var(--cr-ink)] md:text-[34px]">
            Select evaluation criteria
          </h1>
          <div className="relative mt-3 max-w-2xl pb-2">
            <p className="text-[16px] leading-7 text-[var(--cr-ink-2)]">
              Select model-scored measures, rubric-scored measures, or define custom rubrics for this evaluation.
            </p>
            <PencilUnderline className="absolute -bottom-0.5 left-0 h-2.5 w-3/4 text-[var(--cr-brand-primary)] opacity-55" />
          </div>
        </div>
        <MeasuresSketch className="hidden h-20 w-20 text-[var(--cr-brand-primary)] sm:block" />
      </div>
    );
  }

  return (
    <div className="cr-enter">
      <header>
        <PencilRule className="h-2.5 w-full text-[var(--cr-brand-primary)]" />
        <span className="cr-eyebrow mt-3">Run status</span>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="cr-section-title min-w-0 text-lg md:text-xl">
            {isCancelling ? 'Stopping evaluation' : 'Evaluating selected metrics'}
          </h2>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--cr-ink-2)]">
            <EvaluationLoadingMark className="h-3.5 w-3.5" />
            {isCancelling ? 'Stopping' : 'Running'}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[var(--cr-ink-2)]">
          {isCancelling
            ? 'CounselReflect is asking the analysis server to stop this run. A new evaluation will be available after the server confirms cancellation.'
            : <>See which metrics are queued, being analyzed, completed, or unable to finish. Keep this page
              open while CounselReflect runs {totalSelectedMetrics} metric{totalSelectedMetrics === 1 ? '' : 's'} across{' '}
              {phasesToRun.length} metric type{phasesToRun.length === 1 ? '' : 's'}.</>}
        </p>
      </header>

      <div className="cr-module mt-5 p-5 md:p-6">
        <EvaluationProgress
          progress={progress}
          phasesToRun={phasesToRun}
          phaseCounts={phaseCounts}
          onCancel={onCancel}
          isCancelling={isCancelling}
        />
      </div>
    </div>
  );
};
