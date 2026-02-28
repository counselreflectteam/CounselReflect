import React from 'react';
import { getEmotionColor } from './emotionColors';

interface Highlight {
  text: string;
  label: string;
  metricName: string;
}

/**
 * Render content with highlighted emotion triggers
 * Skips neutral emotions and literature metrics
 */
export const renderHighlightedContent = (
  content: string,
  scoreItem: any,
  selectedLiteratureMetrics: string[]
): React.ReactNode => {
  // Collect all highlighted text spans from all metrics for this utterance
  const highlights: Highlight[] = [];

  // Create a set of literature metric names for quick lookup
  const literatureMetricNames = new Set(selectedLiteratureMetrics);

  if (scoreItem.metrics) {
    Object.entries(scoreItem.metrics).forEach(([metricName, metric]: [string, any]) => {
      if (metric.highlighted_text) {
        // Skip highlighting for neutral emotions
        if (metric.label && metric.label.toLowerCase() === 'neutral') {
          return;
        }

        // Skip highlighting for literature-grounded metrics (they evaluate overall quality, not specific triggers)
        if (literatureMetricNames.has(metricName)) {
          return;
        }

        // Split by comma if multiple triggers are provided
        metric.highlighted_text.split(',').forEach((s: string) => {
          const trimmed = s.trim();
          if (trimmed) {
            highlights.push({
              text: trimmed,
              label: metric.label || '',
              metricName: metricName
            });
          }
        });
      }
    });
  }

  if (highlights.length === 0) return content;

  // Sort highlights by length (descending) to avoid overlapping issues during replacement
  highlights.sort((a, b) => b.text.length - a.text.length);

  // Simple implementation: replace exact matches with a span
  let highlightedParts: React.ReactNode[] = [content];

  highlights.forEach(highlight => {
    const nextParts: React.ReactNode[] = [];
    highlightedParts.forEach(part => {
      if (typeof part !== 'string') {
        nextParts.push(part);
        return;
      }

      // Escape regex special characters
      const escaped = highlight.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pieces = part.split(new RegExp(`(${escaped})`, 'gi'));

      pieces.forEach((piece, i) => {
        if (piece.toLowerCase() === highlight.text.toLowerCase()) {
          // Determine color based on the emotion label
          const colors = getEmotionColor(highlight.label);

          nextParts.push(
            <mark
              key={`${highlight.text}-${i}`}
              className={`${colors.mark} rounded px-1 py-0.5 border-b-2 ${colors.border.replace('border', 'border-opacity-50')} mx-0.5 cursor-default inline-flex items-center gap-0.5`}
              title={`Trigger for ${highlight.label} (${highlight.metricName})`}
            >
              <span className="text-[10px] opacity-70 select-none">⚡</span>
              {piece}
            </mark>
          );
        } else if (piece) {
          nextParts.push(piece);
        }
      });
    });
    highlightedParts = nextParts;
  });

  return <>{highlightedParts}</>;
};
