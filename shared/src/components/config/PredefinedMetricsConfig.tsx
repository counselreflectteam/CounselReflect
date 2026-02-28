import React, { useEffect, useState } from 'react';
import { MetricReference, PredefinedMetric } from '../../types';
import { fetchPretrainedMetrics } from '../../services/pretrainedMetricsService';
import { RefreshCw, AlertCircle, ServerIcon, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { TargetSpeakerBadge } from '../../utils/targetSpeakerUtils';
import { useMetrics } from '../../context/MetricsContext';


const normalizeReference = (reference?: MetricReference | string): MetricReference | null => {
  if (!reference) return null;
  if (typeof reference === 'string') {
    return {
      shortApa: reference,
      citation: reference
    };
  }
  return reference;
};

const getShortCitation = (reference: MetricReference | null): string => {
  if (!reference) return 'Not provided yet.';
  return reference.shortApa || reference.citation || reference.title || 'Not provided yet.';
};


export const PredefinedMetricsConfig: React.FC = () => {
  const { selectedPredefinedMetrics, togglePredefinedMetric } = useMetrics();

  const [predefinedMetrics, setPredefinedMetrics] = useState<PredefinedMetric[]>([]);
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [expandedReferences, setExpandedReferences] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPretrainedMetrics();
      setPredefinedMetrics(data.metrics);
      setCategories(data.by_category);
    } catch (err) {
      setError("Failed to load metrics. Please check if the backend is running.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-sm">Loading supported metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <AlertCircle className="w-8 h-8 mb-3 opacity-80" />
        <p className="text-sm font-medium mb-4">{error}</p>
        <button
          onClick={loadMetrics}
          className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Info Banner */}
      <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <ServerIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-1">
            Research-Trained Metrics
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            These metrics are powered by trained models and research-based evaluators. Metrics marked with <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 rounded font-medium"><ServerIcon className="w-3 h-3" />HF</span> use HuggingFace models (requires a HuggingFace API key).
          </p>
        </div>
      </div>
      
      {Object.entries(categories).map(([category, ids]) => (
        <div key={category}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-4 pl-2 border-l-4 border-blue-500 dark:border-blue-400">
            {category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {((ids as string[]) || []).map((id: string) => {
              const metric = predefinedMetrics.find((m) => m.name === id);
              
              if (!metric) return null;
              
              const isHfRequired = metric.requiresHf === true;
              const isSelected = selectedPredefinedMetrics.some(m => m.name === metric.name);
              const reference = normalizeReference(metric.reference);
              const isReferenceExpanded = expandedReferences[metric.name] === true;
              
              return (
                <div
                  key={metric.name}
                  onClick={() => togglePredefinedMetric(metric)}
                  className={`
                    rounded-lg border p-4 transition-all duration-200 relative cursor-pointer
                    ${isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 ring-1 ring-blue-500'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'}
                  `}
                  title={metric.description}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{metric.label}</span>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <TargetSpeakerBadge target={metric.target || 'therapist'} />
                        {isHfRequired && (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-[10px] font-medium">
                            <ServerIcon className="w-3 h-3" />
                            <span>HF</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ml-2 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-500'}`}>
                      {isSelected && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 mt-2">
                      {metric.description}
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Reference
                      </p>
                      {reference && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedReferences((prev) => ({
                              ...prev,
                              [metric.name]: !prev[metric.name]
                            }));
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {isReferenceExpanded ? 'Hide details' : 'Show details'}
                          {isReferenceExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                      {getShortCitation(reference)}
                    </p>

                    {reference && isReferenceExpanded && (
                      <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Title</p>
                          <p className="mt-0.5 leading-relaxed">{reference.title || 'Not provided yet.'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Citation</p>
                          <p className="mt-0.5 leading-relaxed">{reference.citation || 'Not provided yet.'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Link</p>
                          {reference.url ? (
                            <a
                              href={reference.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline break-all"
                            >
                              {reference.url}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <p className="mt-0.5 leading-relaxed">Not provided yet.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
