/**
 * Unified transformer for standardized evaluation responses.
 * 
 * All three evaluation types (Predefined, Literature, Customized) now return
 * the same standardized format from the backend. This transformer converts
 * that format to the frontend's EvaluationResult format.
 */

import { EvaluationResult, UtteranceScore, MetricScore } from '../../types';

/**
 * Standardized backend response format (from all three evaluation endpoints)
 */
export interface StandardizedEvaluationResponse {
  results: {
    [metricName: string]: {
      granularity: 'utterance' | 'conversation' | 'segment';
      overall: MetricScore | null;
      per_utterance: Array<{
        index: number;
        metrics: Record<string, MetricScore>;
        reasoning?: Record<string, string>;
      }> | null;
      per_segment: Array<{
        utterance_indices: number[];
        metrics: Record<string, MetricScore>;
      }> | null;
      summary?: string;
    };
  };
  status: 'success' | 'partial' | 'error';
  timestamp: number;
  message?: string | null;
}

/**
 * Transform standardized backend response to frontend EvaluationResult format.
 * 
 * This function handles responses from:
 * - Predefined Metrics (/predefined_metrics/evaluate)
 * - Literature Metrics (/literature/evaluate)
 * - Customized Metrics (/customize_pipeline/score_with_profile)
 * 
 * @param response - Standardized backend response
 * @param conversationLength - Number of messages in the conversation (for filling empty utterances)
 * @returns Frontend-compatible EvaluationResult
 */
export function transformStandardizedResponse(
  response: StandardizedEvaluationResponse,
  conversationLength: number
): EvaluationResult {
  const results = response.results || {};
  const timestamp = response.timestamp || Date.now();
  
  // Build overallScores and overallLabels from each metric's overall field
  const overallScores: Record<string, number> = {};
  const overallLabels: Record<string, string> = {};
  
  // Build utteranceScores by merging all metrics' per_utterance data
  const utteranceScoresMap = new Map<number, UtteranceScore>();
  
  // Process each metric
  Object.entries(results).forEach(([metricName, metricResult]) => {
    // Extract overall score
    if (metricResult.overall) {
      const overall = metricResult.overall;
      if (overall.type === 'numerical') {
        // Normalize to 0-10 scale for consistency in radar chart
        const normalized = (overall.value / overall.max_value) * 10;
        overallScores[metricName] = Math.round(normalized * 100) / 100;
      } else if (overall.type === 'categorical' && overall.label) {
        // Categorical: use mode (most frequent label) - store label for display
        overallLabels[metricName] = overall.label;
        // Map to numeric for radar chart compatibility
        const label = overall.label.toLowerCase();
        let numericValue = 5.0;
        if (['high', 'good', 'excellent', 'strong', 'positive'].includes(label)) {
          numericValue = 8.0;
        } else if (['medium', 'moderate', 'average', 'neutral'].includes(label)) {
          numericValue = 5.0;
        } else if (['low', 'poor', 'weak', 'negative'].includes(label)) {
          numericValue = 2.0;
        }
        overallScores[metricName] = numericValue;
      }
    }
    
    // Extract per-utterance scores
    if (metricResult.per_utterance && Array.isArray(metricResult.per_utterance)) {
      metricResult.per_utterance.forEach((utt) => {
        const index = utt.index;
        const messageId = `msg-${index}`;
        
        // Get or create utterance entry
        if (!utteranceScoresMap.has(index)) {
          utteranceScoresMap.set(index, {
            messageId,
            metrics: {},
            reasoning: {}
          });
        }
        
        const uttEntry = utteranceScoresMap.get(index)!;
        
        // Add metrics for this utterance
        if (utt.metrics) {
          Object.entries(utt.metrics).forEach(([name, score]) => {
            uttEntry.metrics[name] = score;
          });
        }
        
        // Add reasoning if available
        if (utt.reasoning) {
          Object.entries(utt.reasoning).forEach(([name, reason]) => {
            uttEntry.reasoning[name] = reason;
          });
        }
      });
    }
  });
  
  // Convert map to array, sorted by index
  const utteranceScores = Array.from(utteranceScoresMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([_, value]) => value);
  
  // Fill in missing indices with empty entries
  const completeUtteranceScores: UtteranceScore[] = [];
  for (let i = 0; i < conversationLength; i++) {
    const existing = utteranceScores.find(u => u.messageId === `msg-${i}`);
    if (existing) {
      completeUtteranceScores.push(existing);
    } else {
      completeUtteranceScores.push({
        messageId: `msg-${i}`,
        metrics: {},
        reasoning: {}
      });
    }
  }
  
  return {
    timestamp,
    overallScores,
    ...(Object.keys(overallLabels).length > 0 && { overallLabels }),
    utteranceScores: completeUtteranceScores,
    rawResults: results
  };
}

/**
 * Extract global summary from standardized response.
 * Looks for summary in the first metric's result.
 * 
 * @param response - Standardized backend response
 * @returns Summary string or undefined
 */
export function extractSummary(response: StandardizedEvaluationResponse): string | undefined {
  const results = response.results || {};
  const firstMetric = Object.values(results)[0];
  return firstMetric?.summary;
}

/**
 * Check if response indicates an error or partial success.
 * 
 * @param response - Standardized backend response
 * @returns Error message if present, null otherwise
 */
export function extractError(response: StandardizedEvaluationResponse): string | null {
  if (response.status === 'error') {
    return response.message || 'Evaluation failed';
  }
  if (response.status === 'partial') {
    return response.message || 'Some metrics failed to evaluate';
  }
  return null;
}
