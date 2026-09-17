import type {
  CustomizedMetric,
  MetricOutputKind,
  MetricPresentationSnapshot,
  PredefinedMetric,
} from '../types';
import type { LiteratureMetric } from '../services/literatureMetricsService';
import { PREDEFINED_METRIC_GLOSSES } from '../data/metricGlosses';

type PresentationGuidance = {
  outputKind: MetricOutputKind;
  direction?: MetricPresentationSnapshot['direction'];
  confidenceMeaning?: string;
  caution?: string;
  scaleLabel?: string;
};

const PREDEFINED_GUIDANCE: Record<string, PresentationGuidance> = {
  emotion: {
    outputKind: 'categorical',
    confidenceMeaning: 'Model confidence in the returned emotion class',
    caution: 'Confidence reflects class certainty, not emotional intensity or a clinical assessment.',
  },
  empathy_er: {
    outputKind: 'ordinal',
    confidenceMeaning: 'Model confidence in the returned empathy class',
    caution: 'Low, Medium, and High are model classes, not ratings of the chatbot overall.',
  },
  empathy_ex: {
    outputKind: 'ordinal',
    confidenceMeaning: 'Model confidence in the returned empathy class',
    caution: 'Low, Medium, and High are model classes, not ratings of the chatbot overall.',
  },
  empathy_ip: {
    outputKind: 'ordinal',
    confidenceMeaning: 'Model confidence in the returned empathy class',
    caution: 'Low, Medium, and High are model classes, not ratings of the chatbot overall.',
  },
  talk_type: {
    outputKind: 'categorical',
    caution: 'Change, sustain, and neutral describe speech direction; they are not good/bad or progress ratings.',
  },
  emotional_support_strategy: {
    outputKind: 'categorical',
    caution: 'The returned strategy is a model category, not a rating of intervention quality.',
  },
  toxicity: {
    outputKind: 'multichannel',
    direction: 'lower_is_better',
    scaleLabel: 'Seven independent 0–1 signals',
    caution: 'These signals describe language patterns; they do not establish intent, risk, or a clinical judgment.',
  },
  perspective: {
    outputKind: 'multichannel',
    direction: 'lower_is_better',
    scaleLabel: 'Perceived-attribute probability / 0–1',
    caution: "The score reflects how language may be perceived, not the speaker's intent or a clinical judgment.",
  },
  pair: {
    outputKind: 'numerical',
    direction: 'higher_is_better',
    scaleLabel: 'Continuous score / 0–1',
    caution: "The score applies to this response pair, not the chatbot's overall performance.",
  },
  reccon: {
    outputKind: 'span',
    caution: 'A returned phrase is a possible model-identified trigger; it does not establish causality.',
  },
  fact_score: {
    outputKind: 'numerical',
    direction: 'higher_is_better',
    scaleLabel: 'Supported-claim ratio / 0–1',
    caution: 'Unsupported means unverified by this retrieval pipeline, not necessarily false.',
  },
  medscore: {
    outputKind: 'numerical',
    direction: 'higher_is_better',
    scaleLabel: 'Verified-claim ratio / 0–1',
    caution: 'This checks a configured textbook corpus and does not replace clinical review.',
  },
};

export const prettifyMetricName = (name: string): string =>
  name
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const outputKindForMetric = (
  metric: PredefinedMetric,
  guidance?: PresentationGuidance
): MetricOutputKind => {
  if (guidance?.outputKind) return guidance.outputKind;
  if (metric.outputLabels?.length) return 'categorical';
  return 'unknown';
};

const referenceDetails = (metric: PredefinedMetric): { label?: string; url?: string } => {
  if (!metric.reference) return {};
  if (typeof metric.reference === 'string') return { label: metric.reference };
  return {
    label: metric.reference.shortApa || metric.reference.title || metric.reference.modelName,
    url: metric.reference.url || metric.reference.modelUrl,
  };
};

const addToxicityChildren = (
  snapshot: Record<string, MetricPresentationSnapshot>,
  parent: MetricPresentationSnapshot,
  outputLabels: string[]
) => {
  outputLabels.forEach((rawLabel) => {
    const id = `toxicity_${rawLabel.toLowerCase()}`;
    const label = prettifyMetricName(rawLabel);
    snapshot[id] = {
      ...parent,
      id,
      parentId: parent.id,
      label,
      shortDefinition: `Independent model signal for ${label.toLowerCase()} language.`,
      definition: `A 0–1 score produced independently for the ${label.toLowerCase()} channel.`,
      outputKind: 'numerical',
      scaleLabel: 'Independent signal / 0–1',
      direction: 'lower_is_better',
      confidenceMeaning: undefined,
    };
  });

  snapshot.is_toxic = {
    ...parent,
    id: 'is_toxic',
    parentId: parent.id,
    label: 'Toxicity flag',
    shortDefinition: 'Whether any toxicity signal crossed the configured flag threshold.',
    definition: 'A summary label derived from the highest independent toxicity signal.',
    outputKind: 'categorical',
    scaleLabel: 'Safe / Toxic threshold flag',
    confidenceMeaning: undefined,
  };
  snapshot.primary_category = {
    ...parent,
    id: 'primary_category',
    parentId: parent.id,
    label: 'Highest toxicity signal',
    shortDefinition: 'The toxicity channel with the highest model score when a turn is flagged.',
    outputKind: 'categorical',
    scaleLabel: 'Category label',
    confidenceMeaning: undefined,
  };
};

export const buildMetricPresentationSnapshot = (
  predefinedMetrics: PredefinedMetric[],
  customizedMetrics: CustomizedMetric[],
  literatureMetrics: LiteratureMetric[]
): Record<string, MetricPresentationSnapshot> => {
  const snapshot: Record<string, MetricPresentationSnapshot> = {};

  predefinedMetrics.forEach((metric) => {
    const guidance = PREDEFINED_GUIDANCE[metric.name];
    const reference = referenceDetails(metric);
    const entry: MetricPresentationSnapshot = {
      id: metric.name,
      label: metric.label || prettifyMetricName(metric.name),
      shortDefinition: PREDEFINED_METRIC_GLOSSES[metric.name] || metric.description,
      definition: metric.description,
      sourceType: 'predefined',
      target: metric.target,
      outputKind: outputKindForMetric(metric, guidance),
      scaleLabel:
        guidance?.scaleLabel ||
        (metric.outputLabels?.length ? metric.outputLabels.join(' · ') : metric.outputDescription),
      outputLabels: metric.outputLabels,
      direction: guidance?.direction,
      confidenceMeaning: guidance?.confidenceMeaning,
      caution: guidance?.caution,
      sourceLabel: reference.label,
      sourceUrl: reference.url,
    };
    snapshot[metric.name] = entry;

    if (metric.name === 'toxicity') {
      addToxicityChildren(snapshot, entry, metric.outputLabels || []);
    }
  });

  literatureMetrics.forEach((metric) => {
    const anchors = [
      { label: 'Level 1', description: metric.level1Description },
      { label: 'Level 3', description: metric.level3Description },
      { label: 'Level 5', description: metric.level5Description },
    ].filter(
      (anchor): anchor is { label: string; description: string } => Boolean(anchor.description?.trim())
    );
    const firstSourceIndex = metric.references.findIndex(Boolean);

    snapshot[metric.metricName] = {
      id: metric.metricName,
      label: metric.metricName,
      shortDefinition: metric.definition,
      definition: metric.definition,
      whyItMatters: metric.whyThisMatters,
      sourceType: 'literature',
      target: metric.target,
      outputKind: anchors.length ? 'ordinal' : 'unknown',
      scaleLabel: anchors.length ? 'Rubric rating / 1–5' : undefined,
      anchors,
      sourceLabel:
        firstSourceIndex >= 0
          ? metric.referenceTitles?.[firstSourceIndex] || 'Research source'
          : undefined,
      sourceUrl: firstSourceIndex >= 0 ? metric.references[firstSourceIndex] : undefined,
    };
  });

  customizedMetrics.forEach((metric) => {
    const isNumerical = metric.type === 'numerical';
    snapshot[metric.name] = {
      id: metric.name,
      label: metric.name,
      shortDefinition: metric.description || metric.definition,
      definition: metric.definition || metric.description,
      sourceType: 'custom',
      target: metric.target,
      outputKind: isNumerical ? 'numerical' : 'categorical',
      scaleLabel: isNumerical
        ? metric.range
          ? `Rating / ${metric.range[0]}–${metric.range[1]}`
          : 'Numerical rating'
        : metric.options?.join(' · '),
      outputLabels: metric.options,
      sourceLabel: metric.source,
    };
  });

  return snapshot;
};

export const resolveMetricPresentation = (
  metricName: string,
  snapshot: Record<string, MetricPresentationSnapshot> = {}
): MetricPresentationSnapshot | undefined => {
  if (snapshot[metricName]) return snapshot[metricName];
  const normalized = metricName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const exactNormalized = Object.values(snapshot).find(
    (entry) => entry.id.toLowerCase().replace(/[^a-z0-9]+/g, '_') === normalized
  );
  if (exactNormalized) return exactNormalized;
  return Object.values(snapshot).find(
    (entry) => normalized.startsWith(`${entry.id.toLowerCase()}_`)
  );
};
