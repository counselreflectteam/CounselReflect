import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResultsDashboard } from '../components/dashboard/ResultsDashboard';
import { useEvaluationState } from '@shared/context';
import { useNavigationState } from '../context/NavigationContext';
import { EvaluationStatus } from '@shared/types';
import { EvidenceSketch, PencilUnderline, SketchArrow } from '../components/design/NotebookMarks';

export const ResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { results, status } = useEvaluationState();
  const { markStepCompleted } = useNavigationState();

  useEffect(() => {
    if (results && status === EvaluationStatus.Complete) {
      markStepCompleted(3);
    }
  }, [results, status, markStepCompleted]);

  if (!results || status !== EvaluationStatus.Complete) {
    return (
      <div className="cr-enter mx-auto max-w-6xl">
        <div className="grid gap-7 py-20 sm:grid-cols-[minmax(0,520px)_90px] sm:items-start">
          <div>
          <div className="relative pb-2">
            <h1 className="cr-page-title text-[30px] text-[var(--cr-ink)]">No report available</h1>
            <PencilUnderline className="absolute -bottom-0.5 left-0 h-2.5 w-48 text-[var(--cr-brand-primary)] opacity-55" />
          </div>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-[var(--cr-ink-2)]">
            Select evaluation criteria and generate a report to review summary findings, turn-level scores, and supporting evidence.
          </p>
          <button
            type="button"
            onClick={() => navigate('/configure')}
            className="cr-btn cr-btn-primary cr-focus mt-8 h-10 px-5"
          >
            Select evaluation criteria
            <SketchArrow className="h-3.5 w-5" />
          </button>
          </div>
          <EvidenceSketch className="hidden h-20 w-20 text-[var(--cr-brand-primary)] sm:block" />
        </div>
      </div>
    );
  }

  return (
    <div className="cr-enter mx-auto max-w-6xl">
      <ResultsDashboard />
    </div>
  );
};
