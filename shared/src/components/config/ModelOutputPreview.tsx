import { useId } from 'react';
import type { PredefinedMetric } from '../../types';
import {
  SketchGlyph,
  type Expression,
  type SketchKind
} from './MetricDoodles';

interface ModelOutputPreviewProps {
  metric: Pick<PredefinedMetric, 'name' | 'label' | 'outputDescription' | 'outputLabels'>;
}

interface VisualLabel {
  label: string;
  glyph: SketchKind;
  expression?: Expression;
  level?: 1 | 2 | 3;
}

interface LabelSpec {
  kind: 'labels' | 'ordinal' | 'channels';
  title: string;
  meta: string;
  items: VisualLabel[];
}

interface ScalarSpec {
  kind: 'scalar';
  title: string;
  meta: string;
  lowCaption: string;
  highCaption: string;
}

interface SpanSpec {
  kind: 'span';
  title: string;
  meta: string;
}

interface GenericSpec {
  kind: 'generic';
  title: string;
  meta: string;
}

type OutputSpec = LabelSpec | ScalarSpec | SpanSpec | GenericSpec;

const EMOTIONS = new Set<Expression>([
  'anger',
  'disgust',
  'fear',
  'joy',
  'neutral',
  'sadness',
  'surprise'
]);

const makeLabelItems = (
  labels: string[],
  glyph: SketchKind
): VisualLabel[] => labels.map((label, index) => ({
  label,
  glyph,
  expression: EMOTIONS.has(label.toLowerCase() as Expression)
    ? label.toLowerCase() as Expression
    : undefined,
  level: glyph === 'ordinal' ? Math.min(index + 1, 3) as 1 | 2 | 3 : undefined
}));

const labelSpec = (
  labels: string[],
  kind: LabelSpec['kind'],
  title: string,
  metaNoun: string,
  glyph: SketchKind
): LabelSpec | GenericSpec => labels.length > 0
  ? {
      kind,
      title,
      meta: `${labels.length} ${metaNoun}`,
      items: makeLabelItems(labels, glyph)
    }
  : {
      kind: 'generic',
      title: 'Model output',
      meta: 'See returned structure'
    };

const resolveOutputSpec = (metric: ModelOutputPreviewProps['metric']): OutputSpec => {
  const labels = metric.outputLabels || [];

  switch (metric.name) {
    case 'emotion':
      return labelSpec(labels, 'labels', 'Model labels', 'emotion classes', 'expression');
    case 'empathy_er':
    case 'empathy_ip':
    case 'empathy_ex':
      return labelSpec(labels, 'ordinal', 'Model labels', 'ordered levels', 'ordinal');
    case 'talk_type':
      return labelSpec(labels, 'labels', 'Model labels', 'talk classes', 'category');
    case 'emotional_support_strategy':
      return labelSpec(labels, 'labels', 'Model labels', 'ESConv strategies', 'category');
    case 'toxicity':
      return labelSpec(labels, 'channels', 'Score dimensions', 'independent scores', 'multiscore');
    case 'perspective':
      return labelSpec(labels, 'channels', 'Probability attributes', 'independent attributes', 'multiscore');
    case 'pair':
      return {
        kind: 'scalar',
        title: 'Reflection-quality score',
        meta: 'Continuous / 0-1',
        lowCaption: 'Lower reflection quality',
        highCaption: 'Higher reflection quality'
      };
    case 'fact_score':
      return {
        kind: 'scalar',
        title: 'FActScore',
        meta: 'Continuous / 0-1',
        lowCaption: 'Less support in the retrieval corpus',
        highCaption: 'More support in the retrieval corpus'
      };
    case 'medscore':
      return {
        kind: 'scalar',
        title: 'Mean verification score',
        meta: 'Continuous / 0-1',
        lowCaption: 'Fewer verified claims',
        highCaption: 'More verified claims'
      };
    case 'reccon':
      return {
        kind: 'span',
        title: 'Extracted evidence',
        meta: 'Text span output'
      };
    default:
      return labels.length
        ? labelSpec(labels, 'labels', 'Model labels', 'possible labels', 'category')
        : {
            kind: 'generic',
            title: 'Model output',
            meta: 'Structured output'
          };
  }
};

const LabelGrid = ({ spec }: { spec: LabelSpec }) => {
  const gridClass = spec.kind === 'ordinal'
    ? 'grid-cols-1 min-[420px]:grid-cols-3'
    : spec.items.length > 6
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-2 sm:grid-cols-3';

  return (
    <div className={`mt-4 grid ${gridClass} gap-x-5 gap-y-1`}>
      {spec.items.map(({ label, glyph, expression, level }) => (
        <div
          key={label}
          className="flex min-h-12 min-w-0 items-center gap-2.5 border-b border-[var(--cr-card-border)] py-2"
        >
          <SketchGlyph kind={glyph} expression={expression} level={level} size={26} />
          <span className="min-w-0 break-words text-[0.8125rem] font-medium leading-5 text-[var(--cr-ink)]">
            {label}
          </span>
          {spec.kind === 'channels' && (
            <span className="ml-auto shrink-0 font-mono text-[0.6875rem] text-[var(--cr-ink-3)]">0-1</span>
          )}
        </div>
      ))}
    </div>
  );
};

const ScalarScale = ({ spec }: { spec: ScalarSpec }) => (
  <div className="mt-4 grid gap-3 sm:grid-cols-[36px_minmax(0,1fr)] sm:items-start">
    <SketchGlyph kind="ruler" size={32} className="hidden sm:block" />
    <div className="min-w-0">
      <div aria-hidden className="relative h-4">
        <span className="absolute left-0 right-0 top-1.5 border-t-2 border-[#176BFF]" />
        {[0, 50, 100].map((position) => (
          <span
            key={position}
            className="absolute top-0 h-3.5 border-l-2 border-[#12BFD0]"
            style={{ left: `${position}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[0.6875rem] text-[var(--cr-ink-2)]">
        <span>0</span>
        <span>0.5</span>
        <span>1</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-4 text-[0.6875rem] leading-4 text-[var(--cr-ink-3)]">
        <span>{spec.lowCaption}</span>
        <span className="text-right">{spec.highCaption}</span>
      </div>
    </div>
  </div>
);

const SpanStructure = () => (
  <div className="mt-4 grid items-center gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
    <div className="flex min-h-12 items-center gap-2 border-b border-[var(--cr-card-border)] py-2 text-[var(--cr-ink-2)]">
      <SketchGlyph kind="note" size={27} />
      <span>Emotion-conditioned conversation</span>
    </div>
    <span aria-hidden className="hidden font-mono text-[#F04F68] sm:block">-&gt;</span>
    <div className="flex min-h-12 items-center gap-2 border-b border-[var(--cr-card-border)] py-2 text-[var(--cr-ink)]">
      <SketchGlyph kind="span" size={27} />
      <span className="underline decoration-[#12BFD0] decoration-wavy decoration-2 underline-offset-4">causal span(s)</span>
    </div>
  </div>
);

export const ModelOutputPreview = ({ metric }: ModelOutputPreviewProps) => {
  const spec = resolveOutputSpec(metric);
  const captionId = useId();

  return (
    <figure aria-labelledby={captionId} className="border-y border-[var(--cr-card-border)] py-4">
      <figcaption id={captionId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold text-[var(--cr-ink)]">
          <span className="sr-only">{metric.label}: </span>
          <span>{spec.title}</span>
        </span>
        <span className="cr-meta">{spec.meta}</span>
      </figcaption>
      {metric.outputDescription && (
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--cr-ink-2)]">
          <span className="font-semibold text-[var(--cr-ink)]">Returns: </span>
          {metric.outputDescription}
        </p>
      )}

      {(spec.kind === 'labels' || spec.kind === 'ordinal' || spec.kind === 'channels') && (
        <LabelGrid spec={spec} />
      )}
      {spec.kind === 'scalar' && <ScalarScale spec={spec} />}
      {spec.kind === 'span' && <SpanStructure />}
      {spec.kind === 'generic' && (
        <div className="mt-4 flex min-h-12 items-center gap-2 border-b border-[var(--cr-card-border)] py-2 text-sm text-[var(--cr-ink)]">
          <SketchGlyph kind="note" size={27} />
          <span>See the model description for its returned structure.</span>
        </div>
      )}
    </figure>
  );
};
