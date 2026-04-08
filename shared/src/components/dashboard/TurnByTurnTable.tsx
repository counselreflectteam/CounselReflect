import React from 'react';
import { Role } from '@shared/types';
import { renderHighlightedContent } from '@shared/utils/highlightContent';
import { renderScoreCell } from '@shared/utils/scoreRenderers';

interface TurnByTurnTableProps {
  results: any;
  conversation: any;
  metricNames: string[];
  metricLabelMap: Record<string, string>;
  selectedLiteratureMetrics: string[];
  selectedTurnIndex: number | null;
  onSelectTurn: (index: number) => void;
}

/**
 * Turn-by-turn analysis table with clickable rows
 */
export const TurnByTurnTable: React.FC<TurnByTurnTableProps> = ({
  results,
  conversation,
  metricNames,
  metricLabelMap,
  selectedLiteratureMetrics,
  selectedTurnIndex,
  onSelectTurn
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col h-[650px] transition-colors">
      <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Turn-by-Turn Analysis</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">Click row for full details</span>
      </div>
      <div className="overflow-auto flex-1">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-white dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16">#</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-full min-w-[300px]">Content</th>
              {metricNames.map(name => (
                <th key={name} className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">
                  {metricLabelMap[name] || name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            {results.utteranceScores.map((scoreItem: any, idx: number) => {
              const msg = conversation.messages.find((m: any) => m.id === scoreItem.messageId);
              if (!msg) return null;

              const isSelected = selectedTurnIndex === idx;

              return (
                <tr
                  key={scoreItem.messageId}
                  onClick={() => onSelectTurn(idx)}
                  className={`transition-colors group cursor-pointer border-l-4
                    ${isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-l-blue-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700 border-l-transparent'}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400 dark:text-slate-500 font-mono">
                    {idx + 1}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${msg.role === Role.Therapist ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                      msg.role === Role.Client ? 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                      {msg.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300 w-full min-w-[300px] transition-all">
                    <div className="line-clamp-2 group-hover:line-clamp-none">
                      {renderHighlightedContent(msg.content, scoreItem, selectedLiteratureMetrics)}
                    </div>
                  </td>
                  {metricNames.map(name => (
                    <td key={name} className="px-4 py-4 whitespace-nowrap text-center">
                      {renderScoreCell(name, scoreItem, results)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
