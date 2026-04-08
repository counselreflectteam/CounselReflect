import { useNavigate } from 'react-router-dom';
import { useEvaluation as useEvaluationBase } from '@shared/hooks/useEvaluation';

/**
 * Frontend-specific wrapper for useEvaluation
 * Adds navigation behavior after evaluation completes
 */
export const useEvaluation = () => {
  const navigate = useNavigate();
  
  return useEvaluationBase({
    onNavigate: () => navigate('/results')
  });
};

// Re-export types for convenience
export { EvaluationStatus } from '@shared/hooks/useEvaluation';
