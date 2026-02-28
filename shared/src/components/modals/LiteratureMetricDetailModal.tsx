
import React from 'react';
import { BookOpen, ExternalLink, X, FileText } from 'lucide-react';
import { LiteratureMetric } from '../../services/literatureMetricsService';
import { TargetSpeakerBadge } from '../../utils/targetSpeakerUtils';
import { CategoryBadge } from '../../utils/categoryUtils';

interface LiteratureMetricDetailModalProps {
  metric: LiteratureMetric;
  onClose: () => void;
}

export const LiteratureMetricDetailModal: React.FC<LiteratureMetricDetailModalProps> = ({ 
  metric, 
  onClose 
}) => {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6 flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {metric.metric_name}
              </h3>
              <TargetSpeakerBadge target={metric.target} className="gap-1.5 px-3 py-1" />
              {metric.category && (
                <CategoryBadge 
                  category={metric.category} 
                  className="px-3 py-1 text-xs" 
                />
              )}
            </div>
            <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400">
              <BookOpen className="w-4 h-4" />
              <span>{metric.references?.length || 0} Research References</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Definition */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Definition
            </h4>
            <p className="text-slate-900 dark:text-slate-100 leading-relaxed">
              {metric.definition}
            </p>
          </div>

          {/* Why This Matters */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 uppercase tracking-wider mb-2 flex items-center">
              <span className="mr-2">💡</span> Why This Matters
            </h4>
            <p className="text-blue-900 dark:text-blue-100 leading-relaxed">
              {metric.why_this_matters}
            </p>
          </div>

          {/* Level Descriptions */}
          {(metric.level1Description || metric.level3Description || metric.level5Description) && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
              <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider mb-4 flex items-center">
                <FileText className="w-4 h-4 mr-2" /> Scoring Details
              </h4>
              <div className="space-y-4">
                {metric.level1Description && (
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 inline-block px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 text-xs font-bold rounded">Level 1</span>
                    <p className="text-sm text-indigo-900 dark:text-indigo-100 leading-relaxed m-0">{metric.level1Description}</p>
                  </div>
                )}
                {metric.level3Description && (
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 inline-block px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 text-xs font-bold rounded">Level 3</span>
                    <p className="text-sm text-indigo-900 dark:text-indigo-100 leading-relaxed m-0">{metric.level3Description}</p>
                  </div>
                )}
                {metric.level5Description && (
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 inline-block px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 text-xs font-bold rounded">Level 5</span>
                    <p className="text-sm text-indigo-900 dark:text-indigo-100 leading-relaxed m-0">{metric.level5Description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* References */}
          {metric.references && metric.references.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                Research References
              </h4>
              <div className="space-y-2">
                {metric.references.map((ref: string, idx: number) => (
                  <a
                    key={idx}
                    href={ref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group"
                  >
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      [{idx + 1}]
                    </span>
                    <span className="flex-1 text-sm text-blue-600 dark:text-blue-400 truncate group-hover:underline">
                      {ref}
                    </span>
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
