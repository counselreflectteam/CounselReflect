import React, {useState} from 'react';
import { createPortal } from 'react-dom';
import {Plus, Trash2, Scale, Tag, Check, Loader2, AlertCircle, ChevronDown, ChevronUp, X, ArrowRight, RefreshCw} from 'lucide-react';
import {CustomizedMetric, TargetSpeaker} from '../../types';
import {
  ExamplePayload,
  RefineMetricsResponse,
  refineMetrics,
  rescoreExamples,
  selectFromSources
} from '../../services/customMetricsService';
import {useMetrics} from '../../context/MetricsContext';
import {useAuth} from '../../context/AuthContext';
import {PREDEFINED_METRICS, LITERATURE_METRICS} from '../../constants';
import { TARGET_OPTIONS, TargetSpeakerBadge } from '../../utils/targetSpeakerUtils';
import { MetricListRow } from './MetricListRow';
import { CustomRubricDoodle } from './CustomRubricDoodle';
import { getTargetMarkerTone, MarkerHighlight } from '../design/MarkerHighlight';
import { parseCustomMetricLabels, parseCustomMetricScale } from '../../utils/customMetricScale';



interface CustomMetricRow {
  id: number;
  name: string;
  definition: string;
  type: 'categorical' | 'numerical' | null;
  labels: string;
  target: TargetSpeaker | null;
  allowNotApplicable: boolean;
}

const CUSTOM_METRIC_DRAFT_KEY = 'counselreflectCustomMetricDraft';

const emptyCustomMetricRow = (id = Date.now()): CustomMetricRow => ({
  id,
  name: '',
  definition: '',
  type: null,
  labels: '',
  target: null,
  allowNotApplicable: false
});

const readCustomMetricDraft = (): CustomMetricRow[] => {
  try {
    if (typeof sessionStorage === 'undefined') return [emptyCustomMetricRow(1)];
    const stored = sessionStorage.getItem(CUSTOM_METRIC_DRAFT_KEY);
    if (!stored) return [emptyCustomMetricRow(1)];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.length === 0) return [emptyCustomMetricRow(1)];

    return parsed.map((row, index) => ({
      id: typeof row.id === 'number' ? row.id : Date.now() + index,
      name: typeof row.name === 'string' ? row.name : '',
      definition: typeof row.definition === 'string' ? row.definition : '',
      type: row.type === 'categorical' || row.type === 'numerical' ? row.type : null,
      labels: typeof row.labels === 'string' ? row.labels : '',
      target: row.target === 'therapist' || row.target === 'patient' || row.target === 'both' ? row.target : null,
      allowNotApplicable: row.allowNotApplicable === true
    }));
  } catch {
    return [emptyCustomMetricRow(1)];
  }
};

interface MetricDefinition {
  name: string;
  description: string;
  scale: string;
  guidance: string;
  examples: string[];
  target: TargetSpeaker;
  allow_not_applicable: boolean;
}

interface ExampleRow {
  id: number;
  title: string;       // Short descriptive title derived from conversation topic
  text: string;
  conversation?: any[];
  dimensions: Record<string, string>;
  metricsOutput?: any;
}

const getRowRequirements = (row: CustomMetricRow): boolean[] => [
  Boolean(row.name.trim()),
  Boolean(row.definition.trim()),
  Boolean(row.target),
  Boolean(row.type && (row.type !== 'categorical' || parseCustomMetricLabels(row.labels).length >= 2))
];

const getMetricOutputPreview = (row: CustomMetricRow): string => {
  if (row.type === 'categorical') {
    const labels = parseCustomMetricLabels(row.labels);
    return labels.length > 0 ? labels.join(' / ') : 'Add category labels';
  }
  if (row.type === 'numerical') return 'Anchored rating scale';
  return 'Choose a result format';
};

const formatProviderName = (provider: string): string => {
  const names: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    claude: 'Anthropic',
    gemini: 'Google Gemini',
    ollama: 'Ollama'
  };
  return names[provider.toLowerCase()] || provider;
};

const friendlyBuilderError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error || '');
  const normalized = raw.toLowerCase();

  if (/timeout|timed out/.test(normalized)) {
    return 'Rubric drafting took longer than expected. Your metric definitions are still here; try again.';
  }
  if (/401|403|unauthori[sz]ed|forbidden|credential|api key/.test(normalized)) {
    return 'The selected model could not authorize rubric drafting. Review the provider setup, then try again.';
  }
  if (/network|failed to fetch|connect|unreachable/.test(normalized)) {
    return 'CounselReflect could not reach the rubric service. Confirm that the analysis server is available, then try again.';
  }
  if (/same metrics|metric names|returned/.test(normalized)) return raw;
  return 'CounselReflect could not draft the scoring rubric. Your definitions were preserved so you can try again.';
};

const friendlyExamplesError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/timeout|timed out/i.test(raw)) return 'The sample conversations took too long to load. Try again.';
  if (/network|fetch|connect|unreachable/i.test(raw)) return 'CounselReflect could not reach the sample conversation service. Try again when the analysis server is available.';
  return 'The sample conversations could not be loaded. The scoring rubric is unaffected.';
};

const MetricBlueprint: React.FC<{ row: CustomMetricRow }> = ({ row }) => {
  const target = row.target || 'both';
  const targetLabel = TARGET_OPTIONS.find((option) => option.value === row.target)?.label || 'Choose evaluated turns';
  const labels = row.type === 'categorical' ? parseCustomMetricLabels(row.labels) : [];

  return (
    <div className="mt-4 border-l-2 border-[#12BFD0] py-1 pl-3" aria-label="Metric blueprint preview">
      <p className="cr-meta font-semibold text-[var(--cr-brand-primary)]">Metric blueprint</p>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[var(--cr-ink-2)]">
        <span className="max-w-full break-words font-semibold text-[var(--cr-ink)]">
          {row.name.trim() || 'Untitled metric'}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#12BFD0]" aria-hidden />
        {row.target ? (
          <MarkerHighlight tone={getTargetMarkerTone(target)}>{targetLabel}</MarkerHighlight>
        ) : (
          <span>{targetLabel}</span>
        )}
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#12BFD0]" aria-hidden />
        <span className="min-w-0 break-words">{getMetricOutputPreview(row)}</span>
      </div>
      {labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Category label preview">
          {labels.map((label, index) => (
            <span key={`${label}-${index}`} className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[var(--cr-ink-2)]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${index % 3 === 0 ? 'bg-[#F04F68]' : index % 3 === 1 ? 'bg-[#12BFD0]' : 'bg-[#8B6FD6]'}`} aria-hidden />
              <span className="break-words">{label}</span>
            </span>
          ))}
        </div>
      )}
      {row.allowNotApplicable && (
        <p className="mt-2 text-xs font-semibold text-[#327A65] dark:text-[#75C0A6]">
          N/A is available when the construct does not apply.
        </p>
      )}
    </div>
  );
};

const GeneratedScalePreview: React.FC<{ scale: string; allowNotApplicable?: boolean }> = ({
  scale,
  allowNotApplicable = false
}) => {
  const parsed = parseCustomMetricScale(scale);
  const notApplicableNote = allowNotApplicable ? (
    <p className="mt-2 text-xs font-semibold text-[#327A65] dark:text-[#75C0A6]">
      N/A allowed for turns where this construct cannot be meaningfully rated
    </p>
  ) : null;

  if (parsed.type === 'categorical') {
    return (
      <div className="mt-3" aria-label={`Category labels: ${(parsed.options || []).join(', ')}`}>
        <p className="cr-meta font-semibold">Category labels</p>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {(parsed.options || []).map((option, index) => (
            <span key={`${option}-${index}`} className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[var(--cr-ink)]">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${index % 3 === 0 ? 'bg-[#F04F68]' : index % 3 === 1 ? 'bg-[#12BFD0]' : 'bg-[#8B6FD6]'}`} aria-hidden />
              <span className="break-words">{option}</span>
            </span>
          ))}
        </div>
        {notApplicableNote}
      </div>
    );
  }

  const [minimum, maximum] = parsed.range || [0, 5];
  const midpoint = minimum + ((maximum - minimum) / 2);
  return (
    <div className="mt-3 max-w-sm" aria-label={`Rating scale from ${minimum} to ${maximum}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="cr-meta font-semibold">Rating scale</p>
        <span className="cr-meta font-mono">{scale}</span>
      </div>
      <div className="relative mx-2 mt-2 h-6" aria-hidden>
        <span className="absolute left-0 right-0 top-2 h-0.5 bg-[#176BFF]" />
        {[minimum, midpoint, maximum].map((value, index) => (
          <span key={value} className="absolute top-0 -translate-x-1/2" style={{ left: `${index * 50}%` }}>
            <span className="mx-auto block h-4 w-0.5 bg-[#12BFD0]" />
            <span className="mt-0.5 block font-mono text-[0.625rem] text-[var(--cr-ink-2)]">{Number.isInteger(value) ? value : value.toFixed(1)}</span>
          </span>
        ))}
      </div>
      {notApplicableNote}
    </div>
  );
};

/**
 * Detail view for a custom metric — mirrors the detail-modal pattern used by
 * the Predefined/Literature pickers so the clamped row gloss is always
 * recoverable in full (description, guidance, scale, target).
 */
const CustomMetricDetailModal: React.FC<{
  metric: CustomizedMetric;
  onClose: () => void;
}> = ({ metric, onClose }) => {
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const scaleLabel = metric.type === 'numerical'
    ? `${metric.range?.[0] ?? 0}–${metric.range?.[1] ?? 10}`
    : metric.options?.join(' / ') || 'Categorical';

  React.useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-metric-detail-title"
      onClick={onClose}
    >
      <div
        className="cr-card max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-[var(--shadow-lift)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-[var(--cr-card-border)] bg-[var(--cr-card)] p-4 sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="custom-metric-detail-title" className="text-xl font-bold tracking-tight text-[var(--cr-ink)]">{metric.name}</h3>
              <TargetSpeakerBadge target={metric.target || 'therapist'} />
            </div>
            <p className="cr-meta mt-1">
              Custom metric · <span className="font-mono">{scaleLabel}</span>
              {metric.allowNotApplicable ? ' · N/A allowed' : ''}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="cr-control cr-focus rounded-full p-2 text-[var(--cr-ink-3)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
            aria-label="Close metric details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          <section>
            <h4 className="text-xs font-semibold text-[var(--cr-ink-2)]">Description</h4>
            <p className="mt-2 text-sm leading-relaxed text-[var(--cr-ink)]">{metric.description}</p>
          </section>

          {metric.definition && (
            <section>
              <h4 className="text-xs font-semibold text-[var(--cr-ink-2)]">Guidance</h4>
              <p className="mt-2 text-sm leading-relaxed text-[var(--cr-ink)]">{metric.definition}</p>
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export const CustomizedMetricsConfig: React.FC = () => {
  const {
    addCustomizedMetric,
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

  const {
    apiKeys,
    selectedProvider,
    selectedModel,
    hasValidatedApiKey,
    serverKeyStatus
  } = useAuth();

  const [customRows, setCustomRows] = useState<CustomMetricRow[]>(readCustomMetricDraft);
  const [exampleSeed] = useState<number>(42);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [hasAttemptedGenerate, setHasAttemptedGenerate] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isRubricStale, setIsRubricStale] = useState(false);
  const [generatedMetrics, setGeneratedMetrics] = useState<MetricDefinition[]>([]);
  const [refined, setRefined] = useState<RefineMetricsResponse | null>(null);
  const [refinementInput, setRefinementInput] = useState('');
  const [isGeneratingRubric, setIsGeneratingRubric] = useState(false);
  const [isProfileLocked, setIsProfileLocked] = useState(false);

  // New UI state
  const [step1Open, setStep1Open] = useState(true);
  const [detailMetric, setDetailMetric] = useState<CustomizedMetric | null>(null);

  // Examples workflow
  const [showExamples, setShowExamples] = useState(false);
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [expandedExampleIds, setExpandedExampleIds] = useState<Set<number>>(new Set());
  const [selectedExampleIds, setSelectedExampleIds] = useState<Set<number>>(new Set());
  const [isExamplesLoading, setIsExamplesLoading] = useState(false);
  const [examplesError, setExamplesError] = useState<string | null>(null);
  const [previewResults, setPreviewResults] = useState<Record<number, any>>({});
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [examplesFetchKey, setExamplesFetchKey] = useState(0);

  // Derived step
  const currentStep = isProfileLocked ? 3 : generatedMetrics.length > 0 ? 2 : 1;

  // Step 3 footer: one toggling button — "Select all" flips to "Deselect all"
  // when every metric is selected (explicit handlers per direction, since
  // selectAllCustomizedMetrics itself has toggle semantics).
  const allCustomSelected =
    customizedMetrics.length > 0 &&
    customizedMetrics.every(m => selectedCustomizedMetrics.some(s => s.id === m.id));

  const allRowsReady = customRows.every((row) => getRowRequirements(row).every(Boolean));
  const providerReady = Boolean(
    selectedModel &&
    (
      serverKeyStatus[selectedProvider] ||
      (apiKeys[selectedProvider]?.trim() && hasValidatedApiKey)
    )
  );

  React.useEffect(() => {
    try {
      sessionStorage.setItem(CUSTOM_METRIC_DRAFT_KEY, JSON.stringify(customRows));
    } catch {
      // Draft persistence is a convenience; the in-memory builder remains usable.
    }
  }, [customRows]);

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
      setCustomRows(customizedMetrics.map((metric, index) => ({
        id: Date.now() + index,
        name: metric.name,
        definition: metric.description,
        type: metric.type,
        labels: metric.type === 'categorical' ? (metric.options || []).join(', ') : '',
        target: metric.target || 'therapist',
        allowNotApplicable: metric.allowNotApplicable === true
      })));
      const reconstructedMetrics: MetricDefinition[] = customizedMetrics.map((m: CustomizedMetric) => ({
        name: m.name,
        description: m.description,
        scale: m.type === 'numerical'
          ? `${m.range?.[0] ?? 0}-${m.range?.[1] ?? 5}`
          : m.options?.join('/') || 'Low/Medium/High',
        guidance: m.definition,
        examples: [],
        target: m.target || 'therapist',
        allow_not_applicable: m.allowNotApplicable === true
      }));
      setGeneratedMetrics(reconstructedMetrics);
    }
  }, []);

  // Sync selectedCustomizedMetrics: prune stale selections whose metric no
  // longer exists in customizedMetrics, keeping the still-valid ones. The
  // setter only fires on a mismatch, so once the arrays are consistent the
  // effect settles and cannot loop.
  React.useEffect(() => {
    if (selectedCustomizedMetrics.length > 0) {
      const validSelections = selectedCustomizedMetrics.filter((selected: CustomizedMetric) =>
        customizedMetrics.some((m: CustomizedMetric) => m.id === selected.id)
      );
      if (validSelections.length !== selectedCustomizedMetrics.length) {
        setSelectedCustomizedMetrics(validSelections);
      }
    }
  }, [customizedMetrics, selectedCustomizedMetrics]);

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
            text: ex.conversation.map(c => `${c.role === 'user' ? 'Client' : 'Chatbot'}: ${c.content}`).join('\n\n'),
            conversation: ex.conversation,
            dimensions: ex.dimensions,
            metricsOutput: ex.metrics_output
          };
        });
        setExamples(mapped);
      } catch (err: any) {
        setExamplesError(friendlyExamplesError(err));
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
          const labelsRaw = row.labels.split(/[,|/]/).map(l => l.trim()).filter(l => l.length > 0);
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
    setCustomRows([...customRows, emptyCustomMetricRow()]);
    setGenerationError(null);
    setValidationErrors([]);
    if (generatedMetrics.length > 0) setIsRubricStale(true);
  };

  const handleUpdateRow = (id: number, field: keyof CustomMetricRow, value: any) => {
    setCustomRows(customRows.map(row => row.id === id ? {...row, [field]: value} : row));
    setGenerationError(null);
    setValidationErrors([]);
    if (generatedMetrics.length > 0) {
      setIsRubricStale(true);
      setPreviewResults({});
    }
  };

  const handleRemoveRow = (id: number) => {
    if (customRows.length > 1) {
      setCustomRows(customRows.filter(row => row.id !== id));
    } else {
      setCustomRows([emptyCustomMetricRow()]);
    }
    setGenerationError(null);
    setValidationErrors([]);
    if (generatedMetrics.length > 0) {
      setIsRubricStale(true);
      setPreviewResults({});
    }
  };

  const handleGenerateRubric = async () => {
    setHasAttemptedGenerate(true);
    setGenerationError(null);
    if (!allRowsReady) return;
    const errors = validateMetricNames();
    setValidationErrors(errors);
    if (errors.length > 0) return;
    if (!providerReady) {
      setGenerationError('Complete the model provider setup before drafting a scoring rubric.');
      return;
    }
    setIsGeneratingRubric(true);
    try {
      const rawNotes = customRows.map((row, idx) => {
        let line = `${idx + 1}. ${row.name} (${row.type}${row.target ? `, evaluate: ${row.target}` : ''}): ${row.definition}`;
        if (row.type === 'categorical' && row.labels.trim()) line += `\n   Labels: ${row.labels}`;
        line += `\n   Allow N/A: ${row.allowNotApplicable ? 'yes' : 'no'}`;
        return line;
      }).join('\n\n');
      const response = await refineMetrics(rawNotes, '', selectedProvider || 'openai', selectedModel || 'gpt-4o', apiKeys[selectedProvider] || undefined);
      const targetsByName = new Map(customRows.map((row) => [row.name.trim().toLowerCase(), row.target]));
      const allowNotApplicableByName = new Map(customRows.map((row) => [row.name.trim().toLowerCase(), row.allowNotApplicable]));
      const responseNamesAreValid = response.metrics.length === customRows.length && response.metrics.every((metric) =>
        targetsByName.has(metric.name.trim().toLowerCase())
      );
      if (!responseNamesAreValid) {
        throw new Error('The model did not return the same metrics you defined. Try drafting the rubric again.');
      }
      const metricsWithTarget = response.metrics.map((m) => ({
        ...m,
        target: (targetsByName.get(m.name.trim().toLowerCase()) ?? 'both') as TargetSpeaker,
        allow_not_applicable: allowNotApplicableByName.get(m.name.trim().toLowerCase()) === true
      }));
      setGeneratedMetrics(metricsWithTarget);
      setRefined({ ...response, metrics: metricsWithTarget });
      setIsRubricStale(false);
      setPreviewResults({});
    } catch (err: any) {
      console.error("Rubric generation error:", err);
      setGenerationError(friendlyBuilderError(err));
    } finally {
      setIsGeneratingRubric(false);
    }
  };

  const handleRefineRubric = async () => {
    if (!refinementInput.trim()) return;
    setGenerationError(null);
    setIsGeneratingRubric(true);
    try {
      const rawNotes = customRows.map((row, idx) => `${idx + 1}. ${row.name} (${row.type}): ${row.definition}`).join('\n\n');
      const refinedResp = await refineMetrics(rawNotes, refinementInput, selectedProvider || 'openai', selectedModel || 'gpt-4o', apiKeys[selectedProvider] || undefined, refined?.metrics);
      // Preserve user-owned settings even if the selected model omits them.
      const prevTargetByName = new Map(
        (refined?.metrics ?? generatedMetrics).map(m => [m.name.trim().toLowerCase(), m.target])
      );
      const prevAllowNotApplicableByName = new Map(
        (refined?.metrics ?? generatedMetrics).map(m => [m.name.trim().toLowerCase(), m.allow_not_applicable])
      );
      if (refinedResp.metrics.length !== (refined?.metrics ?? generatedMetrics).length) {
        throw new Error('The model returned a different number of metrics. Your current rubric was left unchanged.');
      }
      const metricsWithTarget = refinedResp.metrics.map((m, idx) => ({
        ...m,
        target: (prevTargetByName.get(m.name.trim().toLowerCase()) ?? customRows[idx]?.target ?? 'both') as TargetSpeaker,
        allow_not_applicable: prevAllowNotApplicableByName.get(m.name.trim().toLowerCase()) === true
      }));
      setGeneratedMetrics(metricsWithTarget);
      setRefined({ ...refinedResp, metrics: metricsWithTarget });
      setRefinementInput('');
      setPreviewResults({});
    } catch (err: any) {
      console.error("Rubric refinement error:", err);
      setGenerationError(friendlyBuilderError(err));
    } finally {
      setIsGeneratingRubric(false);
    }
  };

  const handleLockProfile = () => {
    if (!refined || isRubricStale) return;
    setIsProfileLocked(true);
    clearCustomizedMetrics();
    const rowsByName = new Map(customRows.map((row) => [row.name.trim().toLowerCase(), row]));
    const customized: CustomizedMetric[] = generatedMetrics.map((m, idx) => ({
      ...(() => {
        const inputRow = rowsByName.get(m.name.trim().toLowerCase());
        const parsedScale = parseCustomMetricScale(m.scale, inputRow?.type || undefined);
        return {
          type: parsedScale.type,
          range: parsedScale.type === 'numerical' ? parsedScale.range : undefined,
          options: parsedScale.type === 'categorical' ? parsedScale.options : undefined
        };
      })(),
      id: `customized-${Date.now()}-${idx}`,
      name: m.name,
      category: 'Custom',
      description: m.description,
      definition: m.guidance,
      source: `${formatProviderName(selectedProvider)} rubric workflow`,
      target: m.target,
      allowNotApplicable: m.allow_not_applicable === true
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
      scale: m.type === 'numerical' ? `${m.range?.[0] ?? 0}-${m.range?.[1] ?? 5}` : `enum{${m.options?.join('|') || 'Low|Medium|High'}}`,
      guidance: m.definition,
      examples: [],
      target: m.target || 'therapist',
      allow_not_applicable: m.allowNotApplicable === true
    }));
    setGeneratedMetrics(reconstructedMetrics);
    setCustomRows(customizedMetrics.map((metric, index) => ({
      id: Date.now() + index,
      name: metric.name,
      definition: metric.description,
      type: metric.type,
      labels: metric.type === 'categorical' ? (metric.options || []).join(', ') : '',
      target: metric.target || 'therapist',
      allowNotApplicable: metric.allowNotApplicable === true
    })));
    setIsRubricStale(false);
    setStep1Open(false);
  };

  const handleRemoveGeneratedMetric = (index: number) => {
    const removedMetric = generatedMetrics[index];
    setGeneratedMetrics(prev => prev.filter((_, idx) => idx !== index));
    setRefined((prev) => prev ? { ...prev, metrics: prev.metrics.filter((_, idx) => idx !== index) } : prev);
    setCustomRows((prev) => {
      const remaining = prev.filter((row) => row.name.trim().toLowerCase() !== removedMetric?.name.trim().toLowerCase());
      return remaining.length > 0 ? remaining : [emptyCustomMetricRow()];
    });
    setPreviewResults({});
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
      setExamplesError(friendlyExamplesError(err));
    } finally {
      setIsPreviewLoading(false);
      setIsExamplesLoading(false);
    }
  };

  // Helper: format score to original scale
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

  return (
    <div className="cr-enter flex flex-col min-h-[500px]">
      <section className="border-b border-[var(--cr-card-border)] pb-5 [.cr-module_&]:border-[var(--cr-rule-on-muted)]" aria-labelledby="custom-metric-workbench-title">
        <div className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_170px]">
          <div className="min-w-0">
            <p className="cr-eyebrow text-[var(--cr-brand-primary)]">Metric workbench</p>
            <h3 id="custom-metric-workbench-title" className="cr-section-title mt-2 max-w-2xl">
              Define a measure for what matters in the conversation.
            </h3>
            <p className="mt-2 max-w-2xl text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
              Describe the construct, evaluated turns, and result format. Your selected model will draft scoring guidance for you to review before evaluation.
            </p>
            <p className="cr-meta mt-2 break-words">
              Drafted with <span className="font-semibold text-[var(--cr-ink-2)]">{formatProviderName(selectedProvider)} · {selectedModel || 'model not selected'}</span>
            </p>
          </div>
          <CustomRubricDoodle className="h-auto w-full" />
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-1 md:grid-cols-[152px_minmax(0,1fr)] md:gap-6 xl:grid-cols-[168px_minmax(0,1fr)] xl:gap-8">
        <nav
          className="border-b border-[var(--cr-card-border)] py-4 [.cr-module_&]:border-[var(--cr-rule-on-muted)] md:sticky md:top-20 md:self-start md:border-b-0 md:border-r md:py-6 md:pr-5"
          aria-label="Custom metric workflow"
        >
          <ol className="relative grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-8" aria-label="Metric builder progress">
            <span className="absolute left-[16.66%] right-[16.66%] top-3 h-px bg-[var(--cr-card-border)] [.cr-module_&]:bg-[var(--cr-rule-on-muted)] md:hidden" aria-hidden />
            <span className="absolute bottom-3 left-[11px] top-3 hidden w-px bg-[var(--cr-card-border)] [.cr-module_&]:bg-[var(--cr-rule-on-muted)] md:block" aria-hidden />
            {[
              {
                step: 1,
                label: 'Define',
                detail: `${customRows.filter((row) => row.name.trim()).length} metric${customRows.filter((row) => row.name.trim()).length === 1 ? '' : 's'}`
              },
              {
                step: 2,
                label: 'Review',
                detail: generatedMetrics.length > 0 ? `${generatedMetrics.length} rubric${generatedMetrics.length === 1 ? '' : 's'}` : 'After drafting'
              },
              {
                step: 3,
                label: 'Use',
                detail: isProfileLocked ? `${selectedCustomizedMetrics.length} selected` : 'After review'
              }
            ].map((item) => {
              const complete = currentStep > item.step;
              const active = currentStep === item.step;
              return (
                <li
                  key={item.step}
                  className="relative flex min-w-0 flex-col items-center text-center md:grid md:grid-cols-[24px_minmax(0,1fr)] md:items-center md:gap-3 md:text-left"
                  aria-current={active ? 'step' : undefined}
                >
                  <span className={`z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[0.6875rem] font-bold ${
                    complete
                      ? 'border-[#327A65] bg-[#327A65] text-white'
                      : active
                        ? 'border-[#176BFF] bg-[#176BFF] text-white'
                        : 'border-[var(--cr-input-border)] bg-[var(--cr-card)] text-[var(--cr-ink-3)] [.cr-module_&]:bg-[var(--cr-muted)]'
                  }`}>
                    {complete ? <Check className="h-3.5 w-3.5" aria-hidden /> : item.step}
                  </span>
                  <span className="mt-1.5 min-w-0 md:mt-0">
                    <span className={`block text-xs font-bold ${active ? 'text-[var(--cr-ink)]' : 'text-[var(--cr-ink-2)]'}`}>{item.label}</span>
                    <span className={`mt-0.5 hidden break-words text-[0.6875rem] leading-4 md:block ${active ? 'text-[var(--cr-brand-primary)]' : 'text-[var(--cr-ink-3)]'}`}>
                      {active ? 'In progress' : complete ? 'Complete' : item.detail}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 overflow-hidden">

      {/* Step 1 — define metrics */}
      <div className="overflow-hidden">

        {/* Step 1 header also collapses the completed definition summary. */}
        <button
          onClick={() => currentStep > 1 && !isProfileLocked && setStep1Open(o => !o)}
          className={`cr-focus w-full flex items-start gap-3 py-4 text-left transition-colors ${
            currentStep > 1 && !isProfileLocked ? 'hover:bg-[var(--cr-muted)] [.cr-module_&]:hover:bg-[var(--cr-bg)] cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="flex-1 min-w-0">
            <p className={`cr-category-title text-[1.0625rem] font-bold ${currentStep >= 1 ? 'text-[var(--cr-ink)]' : 'text-[var(--cr-ink-3)]'}`}>
              Define your metrics
            </p>
            {currentStep === 1 && (
              <p className="mt-1 max-w-2xl text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
                State what the metric should assess, whose turns it applies to, and what kind of result it should return.
              </p>
            )}
            {currentStep > 1 && !step1Open && (
              <p className="cr-meta mt-1">
                {customRows.filter(r => r.name.trim()).length} metric{customRows.filter(r => r.name.trim()).length !== 1 ? 's' : ''} defined
              </p>
            )}
          </div>
          {currentStep > 1 && !isProfileLocked && (
            <ChevronDown className={`w-4 h-4 shrink-0 mt-0.5 text-[var(--cr-ink-3)] transition-transform ${step1Open ? 'rotate-180' : ''}`} aria-hidden />
          )}
        </button>

        {/* Collapsed — defined metric names */}
        {currentStep > 1 && !step1Open && (
          <p className="cr-meta pb-8">
            {customRows.filter(r => r.name.trim()).map(r => r.name).join(' · ')}
          </p>
        )}

        {/* Expanded content */}
        {(currentStep === 1 || step1Open) && (
          <div className="pb-8">
            <div className="space-y-6">

              {/* Metric rows */}
              <div className="divide-y divide-[var(--cr-card-border)] [.cr-module_&]:divide-[var(--cr-rule-on-muted)]">
              {customRows.map((row, index) => {
                const requirements = getRowRequirements(row);
                const completedRequirements = requirements.filter(Boolean).length;
                const nameMissing = hasAttemptedGenerate && !requirements[0];
                const definitionMissing = hasAttemptedGenerate && !requirements[1];
                const targetMissing = hasAttemptedGenerate && !requirements[2];
                const resultMissing = hasAttemptedGenerate && !requirements[3];
                const nameId = `custom-metric-name-${row.id}`;
                const definitionId = `custom-metric-definition-${row.id}`;
                const labelsId = `custom-metric-labels-${row.id}`;
                const notApplicableId = `custom-metric-not-applicable-${row.id}`;

                return (
                <section key={row.id} aria-labelledby={`custom-metric-heading-${row.id}`} className="group relative py-6 first:pt-1 last:pb-0">
                  <span className="absolute bottom-5 left-0 top-5 w-0.5 bg-[#12BFD0] opacity-70 first:top-0" aria-hidden />
                  <div className="pl-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="cr-meta font-mono text-[var(--cr-brand-primary)]">{String(index + 1).padStart(2, '0')}</span>
                      <h4 id={`custom-metric-heading-${row.id}`} className="cr-category-title mt-0.5 break-words text-[1.0625rem] font-bold text-[var(--cr-ink)]">
                        {row.name.trim() || 'New metric'}
                      </h4>
                      <p className="cr-meta mt-1">{completedRequirements} of 4 parts complete</p>
                    </div>
                    {!isProfileLocked && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={isGeneratingRubric}
                        className="cr-focus rounded-full p-1.5 text-[var(--cr-ink-3)] transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                        aria-label={`Remove ${row.name.trim() || `metric ${index + 1}`}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                  <div className="space-y-4">
                    {/* Name */}
                    <div>
                      <label htmlFor={nameId} className="mb-1.5 block text-xs font-semibold text-[var(--cr-ink)]">Metric name</label>
                      <input
                        id={nameId}
                        type="text" value={row.name}
                        onChange={e => handleUpdateRow(row.id, 'name', e.target.value)}
                        disabled={isProfileLocked || isGeneratingRubric}
                        aria-invalid={nameMissing}
                        aria-describedby={nameMissing ? `${nameId}-error` : undefined}
                        placeholder="e.g. Emotional validation"
                        className={`cr-focus h-10 w-full rounded-md border bg-transparent [.cr-module_&]:bg-[var(--cr-bg)] px-3 text-sm text-[var(--cr-ink)] placeholder:text-[var(--cr-ink-3)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${nameMissing ? 'border-rose-500' : 'border-[var(--cr-input-border)]'}`}
                      />
                      {nameMissing && <p id={`${nameId}-error`} className="mt-1 text-xs text-rose-600 dark:text-rose-300">Enter a name for this metric.</p>}
                    </div>

                    {/* Definition */}
                    <div>
                      <label htmlFor={definitionId} className="mb-1.5 block text-xs font-semibold text-[var(--cr-ink)]">Construct definition</label>
                      <textarea
                        id={definitionId}
                        value={row.definition}
                        onChange={e => handleUpdateRow(row.id, 'definition', e.target.value)}
                        disabled={isProfileLocked || isGeneratingRubric}
                        aria-invalid={definitionMissing}
                        aria-describedby={definitionMissing ? `${definitionId}-error` : `${definitionId}-help`}
                        placeholder="Describe what the metric should identify or assess."
                        className={`cr-focus h-24 w-full resize-none rounded-md border bg-transparent [.cr-module_&]:bg-[var(--cr-bg)] px-3 py-2 text-sm leading-5 text-[var(--cr-ink)] placeholder:text-[var(--cr-ink-3)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${definitionMissing ? 'border-rose-500' : 'border-[var(--cr-input-border)]'}`}
                      />
                      <p id={`${definitionId}-help`} className="cr-meta mt-1">Define the observable construct, not the desired conclusion.</p>
                      {definitionMissing && <p id={`${definitionId}-error`} className="mt-1 text-xs text-rose-600 dark:text-rose-300">Describe what this metric should assess.</p>}
                    </div>

                    {/* Evaluated turns */}
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-[var(--cr-ink)]">Evaluated turns</p>
                      <div
                        role="radiogroup"
                        aria-label={`Evaluated turns for ${row.name || `metric ${index + 1}`}`}
                        aria-invalid={targetMissing}
                        aria-describedby={targetMissing ? `custom-metric-target-${row.id}-error` : undefined}
                        className={`grid grid-cols-3 gap-1 rounded-md border p-1 ${targetMissing ? 'border-rose-500' : 'border-[var(--cr-input-border)]'}`}
                      >
                        {TARGET_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={row.target === opt.value}
                            onClick={() => handleUpdateRow(row.id, 'target', opt.value)}
                            disabled={isProfileLocked || isGeneratingRubric}
                            title={opt.description}
                            className={`cr-control cr-focus flex min-h-[2.5rem] min-w-0 items-center justify-center gap-1 rounded px-1 py-1.5 text-center text-[0.6875rem] font-semibold leading-tight disabled:cursor-not-allowed disabled:opacity-60 ${
                              row.target === opt.value
                                ? opt.value === 'therapist'
                                  ? 'bg-[#E6EEFC] text-[#1F519F] dark:bg-[#1A3155] dark:text-[#B5D0FF]'
                                  : opt.value === 'patient'
                                    ? 'bg-[#FFE2E8] text-[#9F3143] dark:bg-[#542634] dark:text-[#FFD0D7]'
                                    : 'bg-[#EEE7FF] text-[#6242A0] dark:bg-[#3B2B57] dark:text-[#D8C4FF]'
                                : 'text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] [.cr-module_&]:hover:bg-[var(--cr-bg)]'
                            }`}
                          >
                            {opt.icon}<span className="min-w-0">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                      {targetMissing && <p id={`custom-metric-target-${row.id}-error`} className="mt-1 text-xs text-rose-600 dark:text-rose-300">Choose whose turns this metric evaluates.</p>}
                    </div>

                    {/* Result format */}
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-[var(--cr-ink)]">Result format</p>
                      <div
                        role="radiogroup"
                        aria-label={`Result format for ${row.name || `metric ${index + 1}`}`}
                        aria-invalid={resultMissing}
                        aria-describedby={resultMissing ? (row.type === 'categorical' ? `${labelsId}-error` : `custom-metric-result-${row.id}-error`) : undefined}
                        className={`grid grid-cols-2 gap-1 rounded-md border p-1 ${resultMissing ? 'border-rose-500' : 'border-[var(--cr-input-border)]'}`}
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={row.type === 'numerical'}
                          onClick={() => handleUpdateRow(row.id, 'type', 'numerical')}
                          disabled={isProfileLocked || isGeneratingRubric}
                          className={`cr-control cr-focus flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${row.type === 'numerical' ? 'bg-[#176BFF] text-white' : 'text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] [.cr-module_&]:hover:bg-[var(--cr-bg)]'}`}
                        >
                          <Scale className="h-3.5 w-3.5" aria-hidden /> Rating scale
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={row.type === 'categorical'}
                          onClick={() => handleUpdateRow(row.id, 'type', 'categorical')}
                          disabled={isProfileLocked || isGeneratingRubric}
                          className={`cr-control cr-focus flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${row.type === 'categorical' ? 'bg-[#176BFF] text-white' : 'text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] [.cr-module_&]:hover:bg-[var(--cr-bg)]'}`}
                        >
                          <Tag className="h-3.5 w-3.5" aria-hidden /> Category labels
                        </button>
                      </div>
                      {row.type === 'numerical' && <p className="cr-meta mt-1">The selected model will draft anchored levels for your review.</p>}
                      {resultMissing && row.type !== 'categorical' && <p id={`custom-metric-result-${row.id}-error`} className="mt-1 text-xs text-rose-600 dark:text-rose-300">Choose how this metric should report its result.</p>}
                    </div>

                    {/* Labels (categorical only) */}
                    {row.type === 'categorical' && (
                      <div>
                        <label htmlFor={labelsId} className="mb-1.5 block text-xs font-semibold text-[var(--cr-ink)]">Category labels</label>
                        <input
                          id={labelsId}
                          type="text" value={row.labels}
                          onChange={e => handleUpdateRow(row.id, 'labels', e.target.value)}
                          disabled={isProfileLocked || isGeneratingRubric}
                          aria-invalid={resultMissing}
                          aria-describedby={`${labelsId}-help${resultMissing ? ` ${labelsId}-error` : ''}`}
                          placeholder="e.g. Absent, Emerging, Consistent"
                          className={`cr-focus h-10 w-full rounded-md border bg-transparent [.cr-module_&]:bg-[var(--cr-bg)] px-3 text-sm text-[var(--cr-ink)] placeholder:text-[var(--cr-ink-3)] focus:outline-none disabled:opacity-60 ${resultMissing ? 'border-rose-500' : 'border-[var(--cr-input-border)]'}`}
                        />
                        <p id={`${labelsId}-help`} className="cr-meta mt-1">Enter 2–10 distinct labels, separated by commas.</p>
                        {resultMissing && <p id={`${labelsId}-error`} className="mt-1 text-xs text-rose-600 dark:text-rose-300">Add at least two distinct category labels.</p>}
                      </div>
                    )}

                    <label
                      htmlFor={notApplicableId}
                      className="flex cursor-pointer items-start gap-3 border-l-2 border-[#46A982] bg-[#EDF9F4] px-3 py-2.5 dark:bg-[#173C33] [.cr-module_&]:bg-[#EDF9F4] dark:[.cr-module_&]:bg-[#173C33]"
                    >
                      <input
                        id={notApplicableId}
                        type="checkbox"
                        checked={row.allowNotApplicable}
                        onChange={(event) => handleUpdateRow(row.id, 'allowNotApplicable', event.target.checked)}
                        disabled={isProfileLocked || isGeneratingRubric}
                        className="cr-focus mt-0.5 h-4 w-4 shrink-0 accent-[#327A65] disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-[var(--cr-ink)]">Allow an N/A result</span>
                        <span className="cr-meta mt-0.5 block leading-4">
                          Use N/A only when the construct cannot be meaningfully rated for a selected turn. N/A results are excluded from summaries.
                        </span>
                      </span>
                    </label>
                  </div>

                  <MetricBlueprint row={row} />
                  </div>
                </section>
                );
              })}
              </div>

              {/* Add metric */}
              {!isProfileLocked && (
                <button onClick={handleAddRow} disabled={isGeneratingRubric}
                  className="cr-btn cr-btn-ghost cr-focus h-9 w-full disabled:opacity-50">
                  <Plus className="w-4 h-4" aria-hidden /> Add metric
                </button>
              )}

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="flex items-start gap-2 border-l-2 border-rose-500 bg-rose-50/70 p-3 dark:bg-rose-500/10 dark:[.cr-module_&]:bg-rose-500/15" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />
                  <div className="space-y-0.5 text-xs text-rose-700 dark:text-rose-200">
                    {validationErrors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                </div>
              )}

              {generationError && (
                <div className="flex items-start gap-3 border-l-2 border-rose-500 bg-rose-50/70 p-3 dark:bg-rose-500/10" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-rose-800 dark:text-rose-100">The scoring rubric was not drafted</p>
                    <p className="mt-1 text-xs leading-5 text-rose-700 dark:text-rose-200">{generationError}</p>
                    <button type="button" onClick={handleGenerateRubric} className="cr-link cr-focus mt-2 inline-flex items-center gap-1 rounded-sm text-xs">
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
                    </button>
                  </div>
                </div>
              )}

              {/* Generate button */}
              {!isProfileLocked && (
                <div>
                  <button onClick={handleGenerateRubric}
                    disabled={isGeneratingRubric}
                    className="cr-btn cr-btn-primary cr-focus h-11 w-full">
                    {isGeneratingRubric && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    <span>{generatedMetrics.length > 0 ? 'Update scoring rubric' : 'Draft scoring rubric'}</span>
                  </button>
                  {!allRowsReady && (
                    <p className="cr-meta mt-2 text-center">Complete the name, construct definition, evaluated turns, and result format for each metric.</p>
                  )}
                  {allRowsReady && !providerReady && (
                    <p className="mt-2 text-center text-xs text-rose-600 dark:text-rose-300">Model provider setup is required before drafting.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Step 2 — review rubric. */}
      {generatedMetrics.length > 0 && (
          <div className="overflow-hidden border-t border-[var(--cr-card-border)] [.cr-module_&]:border-[var(--cr-rule-on-muted)]">

            <div className="flex items-start gap-3 py-4">
              <div className="flex-1 min-w-0">
                <p className="cr-category-title text-[1.0625rem] font-bold text-[var(--cr-ink)]">Review scoring rubrics</p>
                {currentStep === 2 && (
                  <p className="mt-1 max-w-2xl text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
                    Check the construct, evaluated turns, result format, and scoring guidance before using these metrics.
                  </p>
                )}
                {isProfileLocked && (
                  <p className="cr-meta mt-1">
                    Scoring rubric in use
                  </p>
                )}
              </div>
              <span className="cr-meta shrink-0 pt-0.5">
                {generatedMetrics.length} {generatedMetrics.length === 1 ? 'metric' : 'metrics'}
              </span>
            </div>

            {/* Step 2 content (only when not locked) */}
            {!isProfileLocked && (
              <div className="pb-8">
                <div className="space-y-6">

                  {isRubricStale && (
                    <div className="flex items-start gap-2 border-l-2 border-[#F04F68] bg-[#FFE2E8]/50 p-3 dark:bg-[#542634]/40" role="status">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#A82E43] dark:text-[#FFD0D7]" aria-hidden />
                      <div className="min-w-0 text-xs leading-5 text-[var(--cr-ink-2)]">
                        <p className="font-semibold text-[var(--cr-ink)]">Definitions changed after this rubric was drafted.</p>
                        <p>Update the scoring rubric before testing or using these metrics.</p>
                      </div>
                    </div>
                  )}

                  {generationError && (
                    <div className="flex items-start gap-3 border-l-2 border-rose-500 bg-rose-50/70 p-3 dark:bg-rose-500/10" role="alert">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-rose-800 dark:text-rose-100">The scoring rubric could not be updated</p>
                        <p className="mt-1 text-xs leading-5 text-rose-700 dark:text-rose-200">{generationError}</p>
                      </div>
                    </div>
                  )}

                  {/* Generated metric cards */}
                  <div className="divide-y divide-[var(--cr-card-border)] [.cr-module_&]:divide-[var(--cr-rule-on-muted)]">
                  {generatedMetrics.map((m, idx) => (
                    <article key={`${m.name}-${idx}`} className="group py-5 first:pt-0 last:pb-0">
                      <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="cr-meta font-mono text-[var(--cr-brand-primary)]">{String(idx + 1).padStart(2, '0')}</span>
                          <h4 className="cr-category-title mt-0.5 break-words text-[1.0625rem] font-bold leading-snug text-[var(--cr-ink)]">{m.name}</h4>
                          <TargetSpeakerBadge target={m.target} className="mt-1" />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveGeneratedMetric(idx)}
                            className="cr-focus rounded-full p-1.5 text-[var(--cr-ink-3)] transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                            aria-label={`Remove ${m.name} from the drafted rubric`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <p className="text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">{m.description}</p>
                      <GeneratedScalePreview scale={m.scale} allowNotApplicable={m.allow_not_applicable} />
                      {m.guidance && (
                        <div className="mt-4 border-l-2 border-[#176BFF] pl-3">
                          <p className="cr-meta font-semibold text-[var(--cr-brand-primary)]">Scoring guidance</p>
                          <p className="mt-1 text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">{m.guidance}</p>
                        </div>
                      )}
                      {m.examples && m.examples.length > 0 && (
                        <div className="mt-3">
                          <p className="cr-meta font-semibold">Examples</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--cr-ink-2)]">{m.examples.join(' · ')}</p>
                        </div>
                      )}
                    </article>
                  ))}
                  </div>

                  <div>
                    <p className="cr-category-title text-[1rem] font-bold text-[var(--cr-ink)]">
                      Request revisions
                    </p>
                    <p className="mb-3 mt-1 text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
                      Describe a precise change to the construct, scale, or guidance. The current draft remains visible until an update succeeds.
                    </p>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                      <textarea
                        value={refinementInput}
                        onChange={e => setRefinementInput(e.target.value)}
                        disabled={isGeneratingRubric || isRubricStale}
                        placeholder="Clarify how partial evidence should be scored."
                        aria-label="Requested rubric revisions"
                        className="cr-focus h-20 min-w-0 flex-1 resize-none rounded-md border border-[var(--cr-input-border)] bg-transparent [.cr-module_&]:bg-[var(--cr-bg)] px-3 py-2 text-sm text-[var(--cr-ink)] placeholder:text-[var(--cr-ink-3)] focus:outline-none disabled:opacity-60"
                      />
                      <button onClick={handleRefineRubric}
                        disabled={isGeneratingRubric || isRubricStale || !refinementInput.trim()}
                        className="cr-btn cr-btn-secondary cr-focus h-10 shrink-0 px-4 sm:self-end [.cr-module_&]:enabled:hover:bg-[var(--cr-bg)]">
                        {isGeneratingRubric && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
                        Update rubric
                      </button>
                    </div>
                  </div>

                  {/* Test on examples — the zone's one module (tool test, §2.2);
                      flattens when it already sits inside a module (extension). */}
                  <div className="cr-module p-4 md:p-5 [.cr-module_&]:bg-transparent [.cr-module_&]:p-0">
                    <button
                      type="button"
                      onClick={() => setShowExamples(v => !v)}
                      aria-expanded={showExamples}
                      className="cr-focus flex w-full items-center gap-3 rounded-sm text-left">
                      <span className="cr-category-title min-w-0 flex-1 text-[1rem] font-bold text-[var(--cr-ink)]">Test with sample conversations</span>
                      <span className="cr-meta shrink-0">Optional</span>
                      {showExamples ? <ChevronUp className="w-4 h-4 shrink-0 text-[var(--cr-ink-3)]" aria-hidden /> : <ChevronDown className="w-4 h-4 shrink-0 text-[var(--cr-ink-3)]" aria-hidden />}
                    </button>

                    {showExamples && (
                      <div className="mt-4 space-y-4">

                        {/* Loading */}
                        {isExamplesLoading && (
                          <div className="flex items-center justify-center gap-2 py-8 text-[var(--cr-ink-2)]">
                            <Loader2 className="w-4 h-4 animate-spin text-brand-600" aria-hidden />
                            <span className="text-sm">Loading example conversations…</span>
                          </div>
                        )}

                        {/* Error */}
                        {examplesError && (
                          <div className="flex gap-2 border-l-2 border-rose-500 bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" role="alert">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />{examplesError}
                          </div>
                        )}

                        {/* Example list */}
                        {!isExamplesLoading && examples.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-[var(--cr-ink-2)]">
                              Select examples to score
                            </p>
                            {examples.map(ex => {
                              const isExpanded = expandedExampleIds.has(ex.id);
                              const isSelected = selectedExampleIds.has(ex.id);
                              const conversation = (ex as any).conversation || [];

                              return (
                                <div key={ex.id} className={`overflow-hidden rounded-lg transition-colors ${
                                  isSelected ? 'bg-brand-50/60 dark:bg-brand-500/15' : ''
                                }`}>
                                  <div className="flex items-center">
                                    <button
                                      type="button"
                                      onClick={() => toggleExampleSelection(ex.id)}
                                      aria-pressed={isSelected}
                                      aria-label={`${isSelected ? 'Deselect' : 'Select'} ${ex.title} for scoring`}
                                      className="cr-focus p-2.5 transition-colors hover:bg-[var(--cr-bg)]"
                                    >
                                      <div className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors ${isSelected ? 'border-brand-600 bg-brand-600 dark:border-brand-500 dark:bg-brand-500' : 'border-[var(--cr-input-border)]'}`}>
                                        {isSelected && <Check className="h-3 w-3 text-white" aria-hidden />}
                                      </div>
                                    </button>
                                    <button
                                      type="button"
                                      className="cr-focus min-w-0 flex-1 px-2 py-2.5 text-left transition-colors hover:bg-[var(--cr-bg)]"
                                      onClick={() => toggleExample(ex.id)}
                                      aria-expanded={isExpanded}
                                      aria-controls={`custom-example-${ex.id}`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="min-w-0 line-clamp-2 break-words text-xs leading-snug text-[var(--cr-ink)]">{ex.title}</p>
                                        <div className="flex shrink-0 items-center gap-2">
                                          <span className="cr-meta">{conversation.length} turns</span>
                                          {ex.metricsOutput && <span className="cr-meta">Scored</span>}
                                          {isExpanded ? <ChevronUp className="h-3 w-3 text-[var(--cr-ink-3)]" aria-hidden /> : <ChevronDown className="h-3 w-3 text-[var(--cr-ink-3)]" aria-hidden />}
                                        </div>
                                      </div>
                                    </button>
                                  </div>

                                  {isExpanded && (
                                    <div id={`custom-example-${ex.id}`} className="custom-scrollbar max-h-48 space-y-2 overflow-y-auto border-t border-[var(--cr-rule-on-muted)] p-3">
                                      {conversation.map((turn: any, i: number) => (
                                        <div key={i} className={`flex gap-2 text-xs ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                          <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[var(--cr-ink)] ${
                                            turn.role === 'user'
                                              ? 'bg-[var(--cr-bg)]'
                                              : 'bg-brand-50 dark:bg-brand-500/15'
                                          }`}>
                                            <span className="cr-meta mb-0.5 block font-semibold">{turn.role === 'user' ? 'Client' : 'Chatbot'}</span>
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
                          <div className="py-6 text-center">
                            <p className="text-xs text-[var(--cr-ink-2)]">No examples loaded.</p>
                            <button onClick={() => { setExamples([]); setExamplesError(null); setExamplesFetchKey(k => k + 1); }} className="cr-link cr-focus mt-1 rounded-sm text-xs">Retry</button>
                          </div>
                        )}

                        {/* Run button — requires selection */}
                        {!isExamplesLoading && examples.length > 0 && (
                          <>
                            {selectedExampleIds.size === 0 && (
                              <p className="cr-meta text-center">Select at least one example to run the rubric.</p>
                            )}
                            <button
                              onClick={handleScoreExamples}
                              disabled={isPreviewLoading || isExamplesLoading || selectedExampleIds.size === 0}
                              className="cr-btn cr-btn-secondary cr-focus h-9 w-full enabled:hover:bg-[var(--cr-bg)]">
                              {isPreviewLoading
                                ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Scoring…</>
                                : <>Run rubric on {selectedExampleIds.size} example{selectedExampleIds.size !== 1 ? 's' : ''}</>}
                            </button>
                          </>
                        )}

                        {/* Results per metric */}
                        {Object.keys(previewResults).length > 0 && (
                          <div className="space-y-3">
                            <p className="text-[0.8125rem] font-bold text-[var(--cr-ink)]">
                              Results by metric
                            </p>

                            {generatedMetrics.map(metric => {
                              const isCategorical = parseCustomMetricScale(metric.scale).type === 'categorical';
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
                                <div key={metric.name}>
                                  <div className="mb-2 flex items-center justify-between">
                                    <span className="text-xs font-semibold text-[var(--cr-ink)]">{metric.name}</span>
                                    <span className="cr-meta font-mono">{metric.scale}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {metricScores.map((s, i) => {
                                      const display = isCategorical && s.label ? s.label
                                        : typeof s.score === 'number' ? formatScore(metric, s.score)
                                        : String(s.score ?? '?');
                                      return (
                                        <div key={i}
                                          title={s.fullTitle}
                                          className="flex min-w-[110px] cursor-default flex-col items-start rounded-lg bg-[var(--cr-bg)] px-3 py-2">
                                          <span className="cr-meta mb-1 w-full truncate leading-none">{s.shortLabel}</span>
                                          <span className="text-sm font-semibold leading-none text-[var(--cr-ink)]">{display}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Prompt user to use the refinement box above */}
                            <p className="text-xs leading-5 text-[var(--cr-ink-2)]">
                              If the results do not reflect the intended construct, revise the scoring guidance and test again.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Use metrics CTA */}
                  <div className="pt-1">
                    <p className="cr-meta mb-2 text-center">This keeps the reviewed scoring rubric with the metrics selected for evaluation.</p>
                    <button onClick={handleLockProfile} disabled={generatedMetrics.length === 0 || isRubricStale}
                      className="cr-btn cr-btn-primary cr-focus h-11 w-full">
                      Use these metrics
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
      )}

      {/* Step 3 — profile active (select metrics) */}
      {isProfileLocked && (
          <div className="relative overflow-hidden border-t border-[var(--cr-card-border)] pl-5 [.cr-module_&]:border-[var(--cr-rule-on-muted)]">
            <svg aria-hidden viewBox="0 0 14 70" className="absolute left-0 top-3 h-16 w-3 overflow-visible">
              <path d="M3 6c4-2 6-1 8 1M3 14c4-2 6-1 8 1M5 25v35" fill="none" stroke="#176BFF" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M2 60c4-2 7 2 11 0" fill="none" stroke="#12BFD0" strokeWidth="1.8" strokeLinecap="round" />
            </svg>

            <div className="flex items-start gap-3 py-4">
              <div className="flex-1 min-w-0">
                <p className="cr-category-title text-[1.0625rem] font-bold text-[var(--cr-ink)]">Metrics ready for evaluation</p>
                <p className="mt-1 text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
                  Choose which reviewed metrics to include in this evaluation.
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs font-semibold text-[#327A65] dark:text-[#75C0A6]">
                <Check className="h-3.5 w-3.5" aria-hidden /> Ready
              </span>
            </div>

            {/* Metric selection list */}
            <div>
              <div className="divide-y divide-[var(--cr-card-border)] [.cr-module_&]:divide-[var(--cr-rule-on-muted)]">
                {customizedMetrics.map(metric => (
                  <MetricListRow
                    key={metric.id}
                    name={metric.name}
                    gloss={metric.description}
                    selected={selectedCustomizedMetrics.some(m => m.id === metric.id)}
                    onToggle={() => toggleCustomizedMetric(metric)}
                    target={metric.target}
                    metaSuffix={
                      <>
                        <span className="cr-meta break-words font-mono">
                          {metric.type === 'numerical' ? `${metric.range?.[0] ?? 0}–${metric.range?.[1] ?? 5}` : metric.options?.join(' / ') || 'categorical'}
                        </span>
                        {metric.allowNotApplicable && (
                          <span className="text-xs font-semibold text-[#327A65] dark:text-[#75C0A6]">N/A allowed</span>
                        )}
                      </>
                    }
                    onOpenDetails={() => setDetailMetric(metric)}
                  />
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--cr-card-border)] [.cr-module_&]:border-[var(--cr-rule-on-muted)] pt-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="cr-meta">
                    {selectedCustomizedMetrics.length} of {customizedMetrics.length} selected for evaluation
                  </p>
                  {/* One toggling button: flips to "Deselect all" once every
                      metric is selected, matching the other pickers. */}
                  <button
                    onClick={allCustomSelected ? clearSelectedCustomizedMetrics : selectAllCustomizedMetrics}
                    className="cr-btn cr-btn-ghost cr-focus h-7 px-2.5 text-xs">
                    {allCustomSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <button onClick={handleUnlockProfile}
                  className="cr-btn cr-btn-secondary cr-focus h-8 px-3 text-xs [.cr-module_&]:enabled:hover:bg-[var(--cr-bg)]">
                  Edit definitions and scoring
                </button>
              </div>
            </div>
          </div>
      )}

        </div>
      </div>

      {/* Custom metric detail view — recovers the full description/guidance
          clamped to one line in the Step 3 rows. */}
      {detailMetric && (
        <CustomMetricDetailModal
          metric={detailMetric}
          onClose={() => setDetailMetric(null)}
        />
      )}
    </div>
  );
};
