import React, {useState} from 'react';
import {Plus, Wand2, RefreshCw, MessageSquare, Trash2, Scale, Tag, Info, Lock, Unlock, Play, AlertCircle, ChevronDown, ChevronUp, TrendingUp, CheckCircle2, ArrowRight, FlaskConical} from 'lucide-react';
import {CustomizedMetric, TargetSpeaker} from '../../types';
import {
  ExamplePayload,
  RefineMetricsResponse,
  refineMetrics,
  updateExampleOutputs,
  updateRubricFromExamples,
  rescoreExamples,
  selectFromSources,
  scoreWithProfile
} from '../../services/customMetricsService';
import { transformStandardizedResponse, StandardizedEvaluationResponse } from '../../services/transformers/evaluationTransformer';
import {useMetrics} from '../../context/MetricsContext';
import {useAuth} from '../../context/AuthContext';
import {PREDEFINED_METRICS, LITERATURE_METRICS} from '../../constants';
import { TARGET_OPTIONS, TargetSpeakerBadge } from '../../utils/targetSpeakerUtils';



interface CustomMetricRow {
  id: number;
  name: string;
  definition: string;
  type: 'categorical' | 'numerical' | null;
  labels: string;
  target: TargetSpeaker | null;
}

interface MetricDefinition {
  name: string;
  description: string;
  scale: string;
  guidance: string;
  examples: string[];
  target: TargetSpeaker;
}

interface ExampleRow {
  id: number;
  title: string;       // Short descriptive title derived from conversation topic
  text: string;
  conversation?: any[];
  dimensions: Record<string, string>;
  metricsOutput?: any;
}

export const CustomizedMetricsConfig: React.FC = () => {
  const {
    addCustomizedMetric,
    removeCustomizedMetric,
    clearCustomizedMetrics,
    customizedMetrics,
    selectedCustomizedMetrics,
    toggleCustomizedMetric,
    selectAllCustomizedMetrics,
    clearSelectedCustomizedMetrics,
    setSelectedCustomizedMetrics,
    setLockedProfile,
    lockedProfile
  } = useMetrics();

  const { apiKeys, selectedProvider, selectedModel } = useAuth();

  const [customRows, setCustomRows] = useState<CustomMetricRow[]>([
    {id: 1, name: '', definition: '', type: null, labels: '', target: null}
  ]);
  const [exampleSeed, setExampleSeed] = useState<number>(42);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [generatedMetrics, setGeneratedMetrics] = useState<MetricDefinition[]>([]);
  const [refined, setRefined] = useState<RefineMetricsResponse | null>(null);
  const [refinementInput, setRefinementInput] = useState('');
  const [isGeneratingRubric, setIsGeneratingRubric] = useState(false);
  const [isProfileLocked, setIsProfileLocked] = useState(false);

  // New UI state
  const [step1Open, setStep1Open] = useState(true);

  // Examples workflow
  const [showExamples, setShowExamples] = useState(false);
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [expandedExampleIds, setExpandedExampleIds] = useState<Set<number>>(new Set());
  const [selectedExampleIds, setSelectedExampleIds] = useState<Set<number>>(new Set());
  const [exampleOutputs, setExampleOutputs] = useState<any[]>([]);
  const [isExamplesLoading, setIsExamplesLoading] = useState(false);
  const [examplesError, setExamplesError] = useState<string | null>(null);
  const [previewResults, setPreviewResults] = useState<Record<number, any>>({});
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [examplesFetchKey, setExamplesFetchKey] = useState(0);

  // Derived step
  const currentStep = isProfileLocked ? 3 : generatedMetrics.length > 0 ? 2 : 1;

  // Auto-collapse step 1 when rubric is generated
  React.useEffect(() => {
    if (generatedMetrics.length > 0 && !isProfileLocked) {
      setStep1Open(false);
    }
  }, [generatedMetrics.length]);

  // Initialize locked state from context on mount
  React.useEffect(() => {
    if (customizedMetrics.length > 0 && lockedProfile) {
      setIsProfileLocked(true);
      setRefined(lockedProfile.rubric);
      const reconstructedMetrics: MetricDefinition[] = customizedMetrics.map((m: CustomizedMetric) => ({
        name: m.name,
        description: m.description,
        scale: m.type === 'numerical'
          ? `${m.range?.[0] || 1}-${m.range?.[1] || 5}`
          : m.options?.join('/') || 'Low/Medium/High',
        guidance: m.definition,
        examples: [],
        target: (m as any).target || 'therapist'
      }));
      setGeneratedMetrics(reconstructedMetrics);
    }
  }, []);

  // Sync selectedCustomizedMetrics
  React.useEffect(() => {
    if (selectedCustomizedMetrics.length > 0) {
      const validSelections = selectedCustomizedMetrics.filter((selected: CustomizedMetric) =>
        customizedMetrics.some((m: CustomizedMetric) => m.id === selected.id)
      );
      if (validSelections.length !== selectedCustomizedMetrics.length) {
        validSelections.forEach((m: CustomizedMetric) => toggleCustomizedMetric(m));
      }
    }
  }, [customizedMetrics.length]);

  // Fetch examples
  React.useEffect(() => {
    const fetchExamples = async () => {
      if (!showExamples) return;
      setIsExamplesLoading(true);
      setExamplesError(null);
      try {
        const res = await selectFromSources({
          selections: [{ source: "ExampleConversations", topic: "therapy_dialogue", count: 5 }],
          seed: exampleSeed
        });
        const mapped = res.examples.map((ex: ExamplePayload, idx: number) => {
          // Derive a short title: use dimensions.title if available,
          // otherwise truncate the first user message to ~50 chars
          const firstUserMsg = ex.conversation.find(c => c.role === 'user')?.content || '';
          const title = ex.dimensions?.title || firstUserMsg;
          return {
            id: idx + 1,
            title,
            text: ex.conversation.map(c => `${c.role === 'user' ? 'Client' : 'Therapist'}: ${c.content}`).join('\n\n'),
            conversation: ex.conversation,
            dimensions: ex.dimensions,
            metricsOutput: ex.metrics_output
          };
        });
        setExamples(mapped);
      } catch (err: any) {
        setExamplesError(err.message || 'Failed to load examples');
      } finally {
        setIsExamplesLoading(false);
      }
    };
    if (showExamples) fetchExamples();
  }, [showExamples, examplesFetchKey]);

  const toggleExample = (id: number) => {
    setExpandedExampleIds((prev: Set<number>) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExampleSelection = (id: number) => {
    setSelectedExampleIds((prev: Set<number>) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const validateMetricNames = (): string[] => {
    const errors: string[] = [];
    const names = customRows.map(r => r.name.trim().toLowerCase());
    const seen = new Set<string>();
    names.forEach((name, idx) => {
      if (name && seen.has(name)) errors.push(`Duplicate metric name: "${customRows[idx].name}"`);
      seen.add(name);
    });
    const predefinedNames = [...PREDEFINED_METRICS, ...LITERATURE_METRICS].map(m => m.name.toLowerCase());
    customRows.forEach(row => {
      if (row.name.trim() && predefinedNames.includes(row.name.trim().toLowerCase()))
        errors.push(`"${row.name}" conflicts with a predefined metric name`);
    });
    customRows.forEach(row => {
      if (row.type === 'categorical') {
        if (!row.labels.trim()) {
          errors.push(`Categorical metric "${row.name || 'unnamed'}" requires labels`);
        } else {
          const labelsRaw = row.labels.split(',').map(l => l.trim()).filter(l => l.length > 0);
          const uniqueLabels = new Set(labelsRaw.map(l => l.toLowerCase()));
          if (labelsRaw.length < 2) errors.push(`"${row.name || 'unnamed'}": at least 2 labels required`);
          else if (labelsRaw.length > 10) errors.push(`"${row.name || 'unnamed'}": maximum 10 labels`);
          if (uniqueLabels.size !== labelsRaw.length) errors.push(`"${row.name || 'unnamed'}": labels must be unique`);
        }
      }
    });
    return errors;
  };

  const handleAddRow = () => {
    setCustomRows([...customRows, {id: Date.now(), name: '', definition: '', type: null, labels: '', target: null}]);
  };

  const handleUpdateRow = (id: number, field: keyof CustomMetricRow, value: any) => {
    setCustomRows(customRows.map(row => row.id === id ? {...row, [field]: value} : row));
  };

  const handleRemoveRow = (id: number) => {
    if (customRows.length > 1) {
      setCustomRows(customRows.filter(row => row.id !== id));
    } else {
      setCustomRows([{id: Date.now(), name: '', definition: '', type: null, labels: '', target: null}]);
    }
  };

  const handleGenerateRubric = async () => {
    const isBasicValid = customRows.every(r => r.name.trim() && r.definition.trim() && r.type && r.target);
    if (!isBasicValid) return;
    const errors = validateMetricNames();
    setValidationErrors(errors);
    if (errors.length > 0) return;
    setIsGeneratingRubric(true);
    try {
      const rawNotes = customRows.map((row, idx) => {
        let line = `${idx + 1}. ${row.name} (${row.type}${row.target ? `, evaluate: ${row.target}` : ''}): ${row.definition}`;
        if (row.type === 'categorical' && row.labels.trim()) line += `\n   Labels: ${row.labels}`;
        return line;
      }).join('\n\n');
      const response = await refineMetrics(rawNotes, '', selectedProvider || 'openai', selectedModel || 'gpt-4o', apiKeys[selectedProvider] || undefined);
      // LLM doesn't return target; inject it from the user's row settings (1:1 mapping guaranteed by rubric)
      const metricsWithTarget = response.metrics.map((m, idx) => ({
        ...m,
        target: (customRows[idx]?.target ?? 'both') as TargetSpeaker
      }));
      setGeneratedMetrics(metricsWithTarget);
      setRefined({ ...response, metrics: metricsWithTarget });
    } catch (err: any) {
      console.error("Rubric generation error:", err);
    } finally {
      setIsGeneratingRubric(false);
    }
  };

  const handleRefineRubric = async () => {
    if (!refinementInput.trim()) return;
    setIsGeneratingRubric(true);
    try {
      const rawNotes = customRows.map((row, idx) => `${idx + 1}. ${row.name} (${row.type}): ${row.definition}`).join('\n\n');
      const refinedResp = await refineMetrics(rawNotes, refinementInput, selectedProvider || 'openai', selectedModel || 'gpt-4o', apiKeys[selectedProvider] || undefined, refined?.metrics);
      setGeneratedMetrics(refinedResp.metrics);
      setRefined(refinedResp);
      setRefinementInput('');
    } catch (err: any) {
      console.error("Rubric refinement error:", err);
    } finally {
      setIsGeneratingRubric(false);
    }
  };

  const handleLockProfile = () => {
    if (!refined) return;
    setIsProfileLocked(true);
    clearCustomizedMetrics();
    const customized: CustomizedMetric[] = generatedMetrics.map((m, idx) => ({
      id: `customized-${Date.now()}-${idx}`,
      name: m.name,
      category: 'Custom',
      description: m.description,
      definition: m.guidance,
      type: m.scale.includes('-') ? 'numerical' : 'categorical',
      range: m.scale.includes('-') ? [parseInt(m.scale.split('-')[0]), parseInt(m.scale.split('-')[1])] as [number, number] : undefined,
      options: !m.scale.includes('-') ? m.scale.split('/') : undefined,
      source: 'OpenAI LLM Workflow',
      target: m.target  
    }));
    customized.forEach(metric => addCustomizedMetric(metric));
    const canonicalExamples: ExamplePayload[] = examples.map(ex => ({
      conversation: (ex as any).conversation || [{ role: 'user', content: ex.text }],
      dimensions: ex.dimensions,
      metrics_output: ex.metricsOutput
    }));
    setLockedProfile({
      version: refined.version,
      rubric: refined,
      userPreferences: {},
      canonicalExamples: canonicalExamples
    });
    setSelectedCustomizedMetrics(customized);
  };

  const handleUnlockProfile = () => {
    setIsProfileLocked(false);
    setLockedProfile(null);
    clearSelectedCustomizedMetrics();
    const reconstructedMetrics: MetricDefinition[] = customizedMetrics.map(m => ({
      name: m.name,
      description: m.description,
      scale: m.type === 'numerical' ? `${m.range?.[0] || 1}-${m.range?.[1] || 5}` : m.options?.join('/') || 'Low/Medium/High',
      guidance: m.definition,
      examples: [],
      target: (m as any).target || 'therapist'
    }));
    setGeneratedMetrics(reconstructedMetrics);
    setStep1Open(false);
  };

  const handleRemoveGeneratedMetric = (index: number) => {
    setGeneratedMetrics(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleRemoveCustomizedMetric = (metricId: string) => {
    const metricToRemove = customizedMetrics.find(m => m.id === metricId);
    if (metricToRemove && selectedCustomizedMetrics.some(m => m.id === metricId)) {
      toggleCustomizedMetric(metricToRemove);
    }
    removeCustomizedMetric(metricId);
  };

  const buildExamplePayloads = (ids: number[]): ExamplePayload[] => {
    return examples.filter(ex => ids.includes(ex.id)).map(ex => ({
      conversation: (ex as any).conversation || [{role: 'user', content: ex.text}],
      dimensions: ex.dimensions as Record<string, string>,
      metrics_output: ex.metricsOutput
    }));
  };

  const handleScoreExamples = async () => {
    if (!refined || generatedMetrics.length === 0) return;
    const idsToScore = selectedExampleIds.size > 0 ? Array.from(selectedExampleIds) : examples.map(ex => ex.id);
    if (idsToScore.length === 0) return;
    setIsPreviewLoading(true);
    setIsExamplesLoading(true);
    setExamplesError(null);
    try {
      const payload = {
        examples: buildExamplePayloads(idsToScore),
        rubric: refined,
        api_key: apiKeys[selectedProvider] || undefined,
        provider: selectedProvider || 'openai',
        model: selectedModel || 'gpt-4o',
        user_preferences: {}
      };
      const outputs = await rescoreExamples(payload);
      const outputMap = Object.fromEntries(idsToScore.map((id, idx) => [id, outputs[idx]]));
      const updatedExamples = examples.map(ex => ({...ex, metricsOutput: outputMap[ex.id] ?? ex.metricsOutput}));
      setExamples(updatedExamples);
      setExampleOutputs(outputs);
      const newPreviewResults: Record<number, any> = {};
      idsToScore.forEach((exampleId, idx) => {
        const out = outputs[idx];
        if (out && (out.metrics || out.scores)) {
          newPreviewResults[exampleId] = {
            overallScores: Object.fromEntries(
              Object.entries(out.metrics || out.scores || {}).map(([k, v]: [string, any]) => [k, typeof v === 'object' && v?.value != null ? v.value : v])
            ),
            overallLabels: Object.fromEntries(
              Object.entries(out.metrics || out.scores || {}).map(([k, v]: [string, any]) => [k, typeof v === 'object' && v?.label != null ? v.label : undefined])
            )
          };
        }
      });
      setPreviewResults(newPreviewResults);
    } catch (err: any) {
      setExamplesError(err.message || 'Failed to score examples');
    } finally {
      setIsPreviewLoading(false);
      setIsExamplesLoading(false);
    }
  };

  // ─── Helper: format score to original scale ───
  const formatScore = (metric: MetricDefinition, normalizedScore: number): string => {
    const scale = metric.scale;
    if (scale.includes('-') && /\d/.test(scale)) {
      try {
        const parts = scale.replace(/integer/gi, '').replace(/float/gi, '').trim().split('-');
        if (parts.length >= 2) {
          const maxVal = parseFloat(parts[parts.length - 1].trim());
          const minVal = parseFloat(parts[0].trim()) || 0;
          if (!isNaN(maxVal) && maxVal > 0) {
            const orig = (normalizedScore / 10) * (maxVal - minVal) + minVal;
            return `${orig.toFixed(1)}/${maxVal}`;
          }
        }
      } catch {}
    }
    return `${normalizedScore.toFixed(1)}`;
  };

  // ─── Step Badge ───
  const StepBadge = ({ step, isComplete, isActive }: { step: number; isComplete: boolean; isActive: boolean }) => (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
      isComplete ? 'bg-emerald-500 text-white' : isActive ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
    }`}>
      {isComplete ? <CheckCircle2 className="w-4 h-4" /> : step}
    </div>
  );

  // ─── Connector ───
  const StepConnector = ({ active }: { active: boolean }) => (
    <div className="flex justify-start pl-[22px]">
      <div className={`w-0.5 h-4 transition-colors ${active ? 'bg-slate-300 dark:bg-slate-600' : 'bg-slate-100 dark:bg-slate-800'}`} />
    </div>
  );

  // ─── JSX ───
  return (
    <div className="flex flex-col min-h-[500px]">

      {/* ════════════════════════════════════════════
          STEP 1 — DEFINE METRICS
      ════════════════════════════════════════════ */}
      <div className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        currentStep === 1
          ? 'border-blue-300 dark:border-blue-700 shadow-sm'
          : 'border-slate-200 dark:border-slate-700'
      } bg-white dark:bg-slate-900`}>

        {/* Step 1 Header */}
        <button
          onClick={() => currentStep > 1 && !isProfileLocked && setStep1Open(o => !o)}
          className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
            currentStep > 1 && !isProfileLocked ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer' : 'cursor-default'
          }`}
        >
          <StepBadge step={1} isComplete={currentStep > 1} isActive={currentStep === 1} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${currentStep >= 1 ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>
              Define Your Metrics
            </p>
            {currentStep === 1 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Name each metric, choose its type, and write a brief definition.
              </p>
            )}
            {currentStep > 1 && !step1Open && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                {customRows.filter(r => r.name.trim()).length} metric{customRows.filter(r => r.name.trim()).length !== 1 ? 's' : ''} defined
                {!isProfileLocked && <span className="text-slate-400 dark:text-slate-500"> · tap to edit</span>}
              </p>
            )}
          </div>
          {currentStep > 1 && !isProfileLocked && (
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${step1Open ? 'rotate-180' : ''}`} />
          )}
        </button>

        {/* Collapsed — metric name chips */}
        {currentStep > 1 && !step1Open && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-2">
            {customRows.filter(r => r.name.trim()).map(r => (
              <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md text-xs border border-slate-200 dark:border-slate-700">
                {r.type === 'numerical' ? <Scale className="w-2.5 h-2.5" /> : <Tag className="w-2.5 h-2.5" />}
                {r.name}
              </span>
            ))}
          </div>
        )}

        {/* Expanded content */}
        {(currentStep === 1 || step1Open) && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 pb-4">
            <div className="pt-4 space-y-4">

              {/* Metric rows */}
              {customRows.map((row, index) => (
                <div key={row.id} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 group">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Metric {index + 1}</span>
                    {!isProfileLocked && (
                      <button onClick={() => handleRemoveRow(row.id)} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {/* Name */}
                    <input
                      type="text" value={row.name}
                      onChange={e => handleUpdateRow(row.id, 'name', e.target.value)}
                      disabled={isProfileLocked}
                      placeholder="Name (e.g. Empathy)"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                    />

                    {/* Definition */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1 block">Definition</label>
                      <textarea
                        value={row.definition}
                        onChange={e => handleUpdateRow(row.id, 'definition', e.target.value)}
                        disabled={isProfileLocked}
                        placeholder="Measure the degree to which the therapist validates the client's feelings…"
                        className="w-full h-20 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>

                    {/* Score Type */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5 block">Score type</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handleUpdateRow(row.id, 'type', 'numerical')} disabled={isProfileLocked}
                          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                            row.type === 'numerical' ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-blue-300 dark:hover:border-blue-600'
                          }`}>
                          <Scale className="w-3 h-3" /> Numerical
                        </button>
                        <button onClick={() => handleUpdateRow(row.id, 'type', 'categorical')} disabled={isProfileLocked}
                          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                            row.type === 'categorical' ? 'bg-fuchsia-50 border-fuchsia-500 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:border-fuchsia-400 dark:text-fuchsia-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-fuchsia-300 dark:hover:border-fuchsia-600'
                          }`}>
                          <Tag className="w-3 h-3" /> Categorical
                        </button>
                      </div>
                    </div>

                    {/* Labels (categorical only) */}
                    {row.type === 'categorical' && (
                      <input
                        type="text" value={row.labels}
                        onChange={e => handleUpdateRow(row.id, 'labels', e.target.value)}
                        disabled={isProfileLocked}
                        placeholder="Labels: Low, Medium, High"
                        className="w-full px-3 py-2 rounded-lg border border-fuchsia-200 dark:border-fuchsia-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:outline-none disabled:opacity-60"
                      />
                    )}

                    {/* Target speaker */}
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 text-slate-400`}>
                        Analyze turns from:
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {TARGET_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => handleUpdateRow(row.id, 'target', opt.value)} disabled={isProfileLocked} title={opt.description}
                            className={`flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                              row.target === opt.value
                                ? opt.value === 'therapist' ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-300'
                                  : opt.value === 'patient' ? 'bg-green-50 border-green-500 text-green-700 dark:bg-green-900/30 dark:border-green-400 dark:text-green-300'
                                  : 'bg-slate-100 border-slate-500 text-slate-700 dark:bg-slate-700 dark:border-slate-400 dark:text-slate-300'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-400 hover:border-slate-300 hover:text-slate-600'
                            }`}>
                            {opt.icon}<span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add metric */}
              {!isProfileLocked && (
                <button onClick={handleAddRow}
                  className="w-full py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 hover:border-fuchsia-300 hover:text-fuchsia-500 hover:bg-fuchsia-50/40 dark:hover:bg-fuchsia-900/10 flex items-center justify-center gap-2 text-sm font-medium transition-all">
                  <Plus className="w-4 h-4" /> Add Another Metric
                </button>
              )}

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-600 dark:text-red-400 space-y-0.5">
                    {validationErrors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                </div>
              )}

              {/* Generate button */}
              {!isProfileLocked && (
                <button onClick={handleGenerateRubric}
                  disabled={isGeneratingRubric || customRows.some(r => !r.name.trim() || !r.definition.trim() || !r.type || !r.target)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {isGeneratingRubric ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  <span>{generatedMetrics.length > 0 ? 'Regenerate Rubric' : 'Generate Rubric'}</span>
                  {!isGeneratingRubric && <ArrowRight className="w-4 h-4 ml-1 opacity-70" />}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════
          STEP 2 — REVIEW & REFINE RUBRIC
      ════════════════════════════════════════════ */}
      {generatedMetrics.length > 0 && (
        <>
          <StepConnector active={true} />
          <div className={`rounded-xl border transition-all duration-200 overflow-hidden ${
            currentStep === 2 ? 'border-blue-300 dark:border-blue-700 shadow-sm' : isProfileLocked ? 'border-emerald-300 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-700'
          } bg-white dark:bg-slate-900`}>

            {/* Step 2 Header */}
            <div className="flex items-center gap-3 p-4">
              <StepBadge step={2} isComplete={isProfileLocked} isActive={currentStep === 2} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Review & Refine Rubric</p>
                {currentStep === 2 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Check the AI-structured rubric. Optionally test on examples, then activate.
                  </p>
                )}
                {isProfileLocked && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {generatedMetrics.length} metrics · rubric locked
                  </p>
                )}
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-100 dark:border-blue-800 font-medium shrink-0">
                {generatedMetrics.length} {generatedMetrics.length === 1 ? 'metric' : 'metrics'}
              </span>
            </div>

            {/* Step 2 Content (only when not locked) */}
            {!isProfileLocked && (
              <div className="border-t border-slate-100 dark:border-slate-800 px-4 pb-4 space-y-4">
                <div className="pt-4 space-y-3">

                  {/* Generated metric cards */}
                  {generatedMetrics.map((m, idx) => (
                    <div key={idx} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-4 group hover:border-blue-200 dark:hover:border-blue-700 transition-all">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{m.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                            m.scale.includes('-')
                              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
                              : 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-700'
                          }`}>{m.scale}</span>
                          <button onClick={() => handleRemoveGeneratedMetric(idx)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-all" title="Remove">
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-2">{m.description}</p>
                      {m.guidance && (
                        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">Guidance: </span>{m.guidance}
                        </div>
                      )}
                      {m.examples && m.examples.length > 0 && (
                        <div className="mt-2 flex items-start gap-1 text-[10px] text-slate-400">
                          <Info className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>Examples: {m.examples.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* ── Refinement input (single, above examples) ── */}
                  <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                      Refine rubric with feedback
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                      Describe what to change — or expand the panel below to test on examples first.
                    </p>
                    <div className="flex gap-2">
                      <textarea
                        value={refinementInput}
                        onChange={e => setRefinementInput(e.target.value)}
                        disabled={isGeneratingRubric}
                        placeholder="e.g. 'Make Empathy stricter' or 'Add more detail to Active Listening guidance'"
                        className="flex-1 h-16 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none disabled:opacity-60"
                      />
                      <button onClick={handleRefineRubric}
                        disabled={isGeneratingRubric || !refinementInput.trim()}
                        className="px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 self-stretch">
                        {isGeneratingRubric ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                        Update
                      </button>
                    </div>
                  </div>

                  {/* ── Test on Examples (Accordion) ── */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowExamples(v => !v)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left">
                      <FlaskConical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Test on Example Conversations</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500">Optional</span>
                      </div>
                      {showExamples ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    </button>

                    {showExamples && (
                      <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-4">

                        {/* Loading */}
                        {isExamplesLoading && (
                          <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Loading example conversations…</span>
                          </div>
                        )}

                        {/* Error */}
                        {examplesError && (
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 flex gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />{examplesError}
                          </div>
                        )}

                        {/* Example list */}
                        {!isExamplesLoading && examples.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                              Select examples to score
                            </p>
                            {examples.map(ex => {
                              const isExpanded = expandedExampleIds.has(ex.id);
                              const isSelected = selectedExampleIds.has(ex.id);
                              const conversation = (ex as any).conversation || [];

                              return (
                                <div key={ex.id} className={`rounded-lg border overflow-hidden transition-all ${
                                  isSelected ? 'border-indigo-400 dark:border-indigo-600 ring-1 ring-indigo-400 dark:ring-indigo-600' : 'border-slate-200 dark:border-slate-700'
                                }`}>
                                  <div className="flex items-center">
                                    <button onClick={() => toggleExampleSelection(ex.id)} className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" title="Select for scoring">
                                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-slate-600'}`}>
                                        {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                                      </div>
                                    </button>
                                    <button className="flex-1 px-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => toggleExample(ex.id)}>
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-2 leading-snug">{ex.title}</p>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="text-[10px] text-slate-400">{conversation.length} turns</span>
                                          {ex.metricsOutput && <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-1.5 py-0.5 rounded">Scored</span>}
                                          {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                                        </div>
                                      </div>
                                    </button>
                                  </div>

                                  {isExpanded && (
                                    <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                      {conversation.map((turn: any, i: number) => (
                                        <div key={i} className={`flex gap-2 text-xs ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                          <div className={`max-w-[85%] rounded-lg px-3 py-1.5 ${
                                            turn.role === 'user'
                                              ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100'
                                              : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                                          }`}>
                                            <span className="font-bold block text-[10px] opacity-60 mb-0.5">{turn.role === 'user' ? 'Client' : 'Therapist'}</span>
                                            {turn.content}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* No examples */}
                        {!isExamplesLoading && examples.length === 0 && !examplesError && (
                          <div className="text-center py-6 text-slate-400">
                            <p className="text-xs">No examples loaded.</p>
                            <button onClick={() => { setExamples([]); setExamplesError(null); setExamplesFetchKey(k => k + 1); }} className="text-xs text-blue-500 mt-1 hover:underline">Retry</button>
                          </div>
                        )}

                        {/* Run button — requires selection */}
                        {!isExamplesLoading && examples.length > 0 && (
                          <>
                            {selectedExampleIds.size === 0 && (
                              <p className="text-[11px] text-center text-slate-400">Select at least one example to run the rubric.</p>
                            )}
                            <button
                              onClick={handleScoreExamples}
                              disabled={isPreviewLoading || isExamplesLoading || selectedExampleIds.size === 0}
                              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                              {isPreviewLoading
                                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Scoring…</>
                                : <><Play className="w-4 h-4 fill-current" /> Run Rubric on {selectedExampleIds.size} Example{selectedExampleIds.size !== 1 ? 's' : ''}</>}
                            </button>
                          </>
                        )}

                        {/* ── Results per metric ── */}
                        {Object.keys(previewResults).length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                              <TrendingUp className="w-3.5 h-3.5" /> Results by Metric
                              <span className="normal-case font-normal text-slate-400">— do the scores match your expectations?</span>
                            </div>

                            {generatedMetrics.map(metric => {
                              const isCategorical = !metric.scale.includes('-');
                              const metricScores = Object.entries(previewResults)
                                .map(([exId, result]: [string, any]) => {
                                  const ex = examples.find(e => e.id === Number(exId));
                                  // Short label: text before the em-dash separator, or first 3 words
                                  const rawTitle = ex?.title || `Example ${exId}`;
                                  const shortLabel = rawTitle.includes('—')
                                    ? rawTitle.split('—')[0].trim()
                                    : rawTitle.split(' — ')[0].trim() || rawTitle.split(' ').slice(0, 3).join(' ');
                                  return {
                                    exId: Number(exId),
                                    score: result.overallScores?.[metric.name],
                                    label: result.overallLabels?.[metric.name],
                                    fullTitle: ex?.title || `Example ${exId}`,
                                    shortLabel
                                  };
                                })
                                .filter(s => s.score !== undefined || s.label);

                              if (metricScores.length === 0) return null;

                              return (
                                <div key={metric.name} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{metric.name}</span>
                                    <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                                      isCategorical
                                        ? 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-700'
                                        : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
                                    }`}>{metric.scale}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {metricScores.map((s, i) => {
                                      const display = isCategorical && s.label ? s.label
                                        : typeof s.score === 'number' ? formatScore(metric, s.score)
                                        : String(s.score ?? '?');
                                      return (
                                        <div key={i}
                                          title={s.fullTitle}
                                          className="flex flex-col items-start px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-[110px] cursor-default">
                                          <span className="text-[9px] text-slate-400 leading-none mb-1 w-full truncate">{s.shortLabel}</span>
                                          <span className="font-bold text-slate-700 dark:text-slate-100 text-sm leading-none">{display}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Prompt user to use the refinement box above */}
                            <div className="p-3 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-800 text-[11px] text-indigo-700 dark:text-indigo-300">
                              Scores not what you expected? Use the <span className="font-semibold">Refine rubric with feedback</span> box above to describe what to change, then click <span className="font-semibold">Update</span>.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Activate Profile CTA ── */}
                  <div className="pt-1">
                    <p className="text-[10px] uppercase tracking-wider text-center text-slate-400 mb-2">Happy with the rubric? Lock and activate it.</p>
                    <button onClick={handleLockProfile} disabled={generatedMetrics.length === 0}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                      <Lock className="w-4 h-4" />
                      Activate Profile
                      <ArrowRight className="w-4 h-4 opacity-70" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════
          STEP 3 — PROFILE ACTIVE (SELECT METRICS)
      ════════════════════════════════════════════ */}
      {isProfileLocked && (
        <>
          <StepConnector active={true} />
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">

            {/* Step 3 Header */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
              <StepBadge step={3} isComplete={false} isActive={true} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Select Metrics for Evaluation</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choose which custom metrics to include when running the evaluation.
                </p>
              </div>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 shrink-0">
                <Lock className="w-3 h-3" /> Active
              </span>
            </div>

            {/* Metric selection grid */}
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customizedMetrics.map(metric => {
                  const isSelected = selectedCustomizedMetrics.some(m => m.id === metric.id);
                  return (
                    <div key={metric.id} onClick={() => toggleCustomizedMetric(metric)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600 ring-1 ring-blue-400 dark:ring-blue-600'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}>
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{metric.name}</span>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-600'}`}>
                          {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 mb-2">{metric.description}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                          metric.type === 'numerical'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700'
                            : 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900 dark:text-fuchsia-200 dark:border-fuchsia-700'
                        }`}>
                          {metric.type === 'numerical' ? `${metric.range?.[0] || 0}–${metric.range?.[1] || 10}` : metric.options?.join('/') || 'categorical'}
                        </span>
                        {metric.target && (
                          <TargetSpeakerBadge target={metric.target} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedCustomizedMetrics.length} of {customizedMetrics.length} selected for evaluation
                </p>
                <button onClick={handleUnlockProfile}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <Unlock className="w-4 h-4" /> Edit Rubric
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Placeholder step 3 (not yet reached) */}
      {!isProfileLocked && (
        <>
          <StepConnector active={generatedMetrics.length > 0} />
          <div className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-center gap-3 transition-all ${
            generatedMetrics.length === 0 ? 'opacity-30' : 'opacity-60'
          }`}>
            <StepBadge step={3} isComplete={false} isActive={false} />
            <div>
              <p className="text-sm font-semibold text-slate-400">Select Metrics & Activate</p>
              <p className="text-xs text-slate-400 mt-0.5">Available after activating the profile above.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
