import type { ReactNode } from 'react';

export type SketchKind = 'expression' | 'ordinal' | 'category' | 'multiscore' | 'ruler' | 'span' | 'note';
export type Expression = 'anger' | 'disgust' | 'fear' | 'joy' | 'neutral' | 'sadness' | 'surprise';

interface SketchGlyphProps {
  kind: SketchKind;
  expression?: Expression;
  level?: 1 | 2 | 3;
  size?: number;
  className?: string;
}

const BLUE = 'var(--cr-sketch-blue, #176BFF)';
const BLUE_WASH = 'var(--cr-sketch-blue-wash, #DCEAFF)';
const BLUE_SOFT = 'var(--cr-sketch-blue-soft, #EAF3FF)';
const CYAN = 'var(--cr-sketch-cyan, #12BFD0)';
const CORAL = 'var(--cr-sketch-coral, #F04F68)';
const INK = 'var(--cr-sketch-ink, #12305A)';
const PAPER = 'var(--cr-sketch-paper, #FFFBE8)';
const YELLOW = 'var(--cr-sketch-yellow, #FFF2B0)';
const PINK = 'var(--cr-sketch-pink, #FFE2E8)';
const GOLD_INK = 'var(--cr-sketch-gold-ink, #B56B00)';

const expressionPaths = (expression: Expression): ReactNode => {
  switch (expression) {
    case 'anger':
      return <><path d="M10.5 13.1l3.1 1.2M21.8 13l-3.2 1.3" /><path d="M11.4 21.6c2.5-2.1 6.4-2.4 9.2-.3" /></>;
    case 'disgust':
      return <><path d="M10.8 14.2c.9-.8 1.9-.8 2.8 0M18.8 13.5l3 .1" /><path d="M11.3 20.2c2.1-1.2 3.2 1 5.1-.1 1.5-.9 2.6.1 4.1-.4" /></>;
    case 'fear':
      return <><path d="M10.4 12.4c1.1-1.2 2.1-1.3 3.1-.2M18.6 12.1c1.1-1 2.2-.9 3.1.1" /><path d="M13 20.3c.4-3.5 5.7-3.6 6.3-.2.3 1.8-.9 3.1-3 3.1-2 0-3.5-1.1-3.3-2.9Z" /></>;
    case 'joy':
      return <><path d="M10.5 14.4c1.1-1.4 2.2-1.4 3.3 0M18.6 14.1c1.1-1.3 2.1-1.3 3.2 0" /><path d="M10.9 19.2c2.4 4.7 7.6 5.1 10.1-.4" /></>;
    case 'neutral':
      return <><path d="M10.7 13.8h2.6M18.8 13.8h2.6" /><path d="M11.6 20.7c2.8.2 5.8.2 8.7-.1" /></>;
    case 'sadness':
      return <><path d="M10.4 13.4c1-.9 2.1-.9 3.1 0M18.7 13.4c1-.9 2.1-.9 3.1 0" /><path d="M11.5 22.1c2.4-3.5 6.3-3.7 8.9-.3" /></>;
    case 'surprise':
      return <><path d="M10.5 13.6c.8-1.3 2.1-1.3 2.9 0M18.8 13.5c.8-1.3 2.1-1.3 2.9 0" /><ellipse cx="16.2" cy="20.8" rx="2.7" ry="3.2" /></>;
  }
};

const primaryPaths = (kind: SketchKind, expression: Expression, level: 1 | 2 | 3): ReactNode => {
  switch (kind) {
    case 'expression':
      return (
        <>
          <path d="M6.7 9.4C9 5.7 22.6 5.4 25.4 10.3c2.1 3.8.7 11.2-4 14-3.9 2.1-10.8 1.3-13.6-2.6-2.5-3.5-3.2-8.9-1.1-12.3Z" />
          {expressionPaths(expression)}
        </>
      );
    case 'ordinal':
      return (
        <>
          <path d="M5.6 25.2l.3-5.5 4.3-.4.1 5.9-4.7.3ZM13 25.4l.2-10 4.4-.5.2 10-4.8.5ZM20.6 25l.3-15.6 4.3-.6.4 15.7-5 .5Z" />
          <path d={level === 1 ? 'M6.6 22.2h2.8' : level === 2 ? 'M14 17.2h2.8' : 'M21.7 11.7h2.8'} />
        </>
      );
    case 'category':
      return <path d="M7.1 10.8c-1.6-1.8.2-5 2.7-4.5 2.8.5 3.3 3.9 1 5.2-2.1 1.2-3.8.6-4.7-.7ZM21.8 8.1c2.7-.4 4.2 2.6 2.6 4.5-1.5 1.8-4.8.9-4.8-1.5 0-1.4.8-2.7 2.2-3ZM15.6 20.3c3.1-.3 4.3 3.3 2.2 5-2 1.5-5.2-.2-4.5-2.8.3-1.1 1.1-2 2.3-2.2Z" />;
    case 'multiscore':
      return <path d="M5 8.2c6-.7 15.2.4 22-.3M4.8 13.6c7 .5 14.7-.6 22.4.1M5.2 19.2c5.8-.5 15.4.6 21.7-.2M4.9 24.7c7.2.4 14.6-.5 22.1.1" />;
    case 'ruler':
      return <path d="M4.4 23.5c6.2-.6 15.8.7 23.1-.4M5.3 19.2l-.2 4.2M10.7 21.1l-.1 2.6M16 18.5l.1 5M21.4 20.7l.2 2.8M27 18.8l.2 4.1" />;
    case 'span':
      return <path d="M5.1 8.4c4.2-.4 8 .4 11.8-.1M19 8.3c2.8.2 5.3-.2 7.8.1M5 14c2.2.2 4.2-.2 6.1.1M12.8 14c4.8-.3 9 .4 14-.2M5.2 19.8c5.4-.4 10.1.4 15.3-.1" />;
    case 'note':
      return <path d="M7.2 5.8l15.1-1 3.5 4.1-.8 16.8-16.8.8-2.1-3.1 1.1-17.6ZM22.3 4.9l-.2 4.8 3.6-.8M11 12.2c3.2-.5 6.3.2 9.7-.2M10.7 16.5c4.6.3 7.5-.4 11.5-.1M10.5 20.8c2.6-.3 4.9.2 7.3-.1" />;
  }
};

const accentPaths = (kind: SketchKind): ReactNode => {
  switch (kind) {
    case 'expression':
      return <path d="M8.1 7.8c4.7-2.4 12.8-2.7 17.1.7" />;
    case 'ordinal':
      return <path d="M4.7 27c5.8-.7 15.9.2 22.3-1" />;
    case 'category':
      return <path d="M11.5 10.6c3.1-.8 5.7-.8 8.4-.1M18 20.8c1.6-2.7 2.7-5 3.1-7.4" />;
    case 'multiscore':
      return <path d="M5.2 6.7v3M27 6.4v3M5 23.2v3M26.8 23.3v3" />;
    case 'ruler':
      return <path d="M4.2 26.5c7 .3 16.4-.4 23.4.1" />;
    case 'span':
      return <path d="M11.7 11.9c-.9.4-1.1 1.4-1 2.4l.2 2.2c.1 1 .5 1.7 1.4 2M26.9 11.7c.8.5 1 1.3.9 2.3l-.2 2.1c-.1 1.1-.5 1.8-1.4 2.3M12.8 17.2c4.5-.7 9.4.7 13.8-.3" />;
    case 'note':
      return <path d="M4.5 10.8l-2.1 1.4M26.8 20.6l2.4 1.1" />;
  }
};

export const SketchGlyph = ({
  kind,
  expression = 'neutral',
  level = 2,
  size = 24,
  className = ''
}: SketchGlyphProps) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    fill="none"
    aria-hidden="true"
    focusable="false"
    className={`shrink-0 overflow-visible ${className}`}
  >
    <path d="M5 17.2C9.1 11.4 22.9 10.6 27 16.1" stroke={BLUE_WASH} strokeWidth="8" strokeLinecap="round" opacity=".9" />
    <g stroke={BLUE} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" opacity=".18" transform="translate(.45 .35)">
      {primaryPaths(kind, expression, level)}
    </g>
    <g stroke={BLUE} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {primaryPaths(kind, expression, level)}
    </g>
    <g stroke={kind === 'note' ? CORAL : CYAN} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      {accentPaths(kind)}
    </g>
  </svg>
);

const ComicOutput = ({ metricName }: { metricName: string }) => {
  if (metricName === 'emotion') {
    return (
      <g>
        {[142, 176, 210].map((x, index) => (
          <g key={x} transform={`translate(${x} 28)`} stroke={BLUE} strokeWidth="1.6" fill="none" strokeLinecap="round">
            <path d="M0 8c1-7 9-10 16-6 6 4 5 13 0 17-6 4-15 0-16-7Z" fill={index === 1 ? YELLOW : BLUE_SOFT} />
            <path d="M5 9h1M11 9h1" />
            <path d={index === 0 ? 'M5 15c3-3 6-3 9 0' : index === 1 ? 'M5 14c3 3 6 3 9 0' : 'M5 14h9'} />
          </g>
        ))}
        <path d="M141 60c22 3 49-3 72 1" stroke={CORAL} strokeWidth="3" strokeLinecap="round" />
      </g>
    );
  }

  if (metricName.startsWith('empathy_')) {
    return (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M172 53c-26-14-14-34 0-19 14-15 27 5 0 19Z" fill={PINK} stroke={CORAL} strokeWidth="2" />
        <path d="M145 63c15-7 38-7 55 0M151 70c12-5 29-5 42 0" stroke={CYAN} strokeWidth="2" />
        <path d="M207 28v32M215 38v22M223 47v13" stroke={BLUE} strokeWidth="2.2" />
      </g>
    );
  }

  if (metricName === 'talk_type') {
    return (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M140 30c15-8 26 1 35-5 8-5 15-1 22 4" stroke={BLUE} />
        <path d="M140 47c18 1 35-1 55 0" stroke={CYAN} />
        <path d="M140 64c13 7 25-2 36 4 8 4 14 1 21-3" stroke={CORAL} />
        <path d="M199 24l6 5-7 4M197 42l7 5-7 5M199 61l6 4-7 5" stroke={INK} />
      </g>
    );
  }

  if (metricName === 'emotional_support_strategy') {
    return (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M142 28c13-9 39-8 54 1 10 7 7 18-3 23-12 6-34 4-43-3l-8 5 2-10c-6-5-7-11-2-16Z" fill={BLUE_SOFT} stroke={BLUE} strokeWidth="1.8" />
        <path d="M154 34c9-2 18 1 28-1M153 41c12 2 25-2 36 0" stroke={CYAN} strokeWidth="2" />
        <path d="M207 31l3 5 6 1-4 4 1 6-6-3-5 3 1-6-4-4 6-1 2-5Z" fill={YELLOW} stroke={GOLD_INK} strokeWidth="1.5" />
      </g>
    );
  }

  if (metricName === 'toxicity' || metricName === 'perspective') {
    return (
      <g fill="none" strokeLinecap="round">
        {[27, 39, 51, 63].map((y, index) => (
          <g key={y}>
            <path d={`M140 ${y}c20 ${index % 2 ? 2 : -2} 49 ${index % 2 ? -1 : 1} 79 0`} stroke={BLUE} strokeWidth="2" />
            <path d={`M140 ${y - 3}v6M219 ${y - 3}v6`} stroke={index === 2 ? CORAL : CYAN} strokeWidth="2" />
          </g>
        ))}
      </g>
    );
  }

  if (metricName === 'pair') {
    return (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M139 26c9-5 23-4 29 2 5 6 0 12-8 13l-5 5v-5c-8 0-15-4-16-10Z" fill={BLUE_SOFT} stroke={BLUE} strokeWidth="1.7" />
        <path d="M179 33c9-4 25-1 28 6 3 6-3 11-12 11l-5 5v-6c-9-1-14-6-11-12Z" fill={YELLOW} stroke={GOLD_INK} strokeWidth="1.7" />
        <path d="M140 66c21-2 52 2 78-1M143 61v6M180 60v7M216 60v7" stroke={CYAN} strokeWidth="2" />
      </g>
    );
  }

  if (metricName === 'reccon') {
    return (
      <g fill="none" strokeLinecap="round">
        <path d="M140 28c18-2 40 2 76 0M140 40c11 1 22-1 34 0M178 40c12-2 25 2 40 0M140 52c22-1 42 2 70 0M155 58c15-4 31 4 49-1" stroke={BLUE} strokeWidth="1.8" />
        <path d="M176 35c-3 1-3 4-3 7v6c0 3 1 5 4 6M218 34c3 1 3 4 3 7v6c0 4-1 6-4 7" stroke={CORAL} strokeWidth="2.2" />
        <path d="M177 45c11-3 25 3 40 0" stroke={CYAN} strokeWidth="4" opacity=".7" />
      </g>
    );
  }

  const medical = metricName === 'medscore';
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M139 26c10-2 20 2 29 0M139 38c9 1 17-2 27 0M139 50c11-2 20 2 31 0" stroke={BLUE} strokeWidth="1.9" />
      <path d="M174 25l6 4-6 4M174 37l6 4-6 4M174 49l6 4-6 4" stroke={CORAL} strokeWidth="1.8" />
      <path d="M190 23c8-4 16 0 23-2l3 39c-8-2-15-1-22 2l-4-39ZM216 21c7-2 13 1 18 4l-4 38c-4-3-9-4-14-3V21Z" fill={YELLOW} stroke={GOLD_INK} strokeWidth="1.7" />
      {medical ? (
        <path d="M207 36v12M201 42h12" stroke={CORAL} strokeWidth="2.4" />
      ) : (
        <path d="M202 42l5 5 11-13" stroke={CYAN} strokeWidth="2.5" />
      )}
    </g>
  );
};

export const MetricMiniComic = ({ metricName }: { metricName: string }) => (
  <svg
    viewBox="124 0 116 88"
    aria-hidden="true"
    focusable="false"
    className="h-auto w-full max-w-[132px] overflow-visible sm:max-w-[180px]"
  >
    <path d="M125 7c36-4 77-4 111 2l1 68c-35 4-78 5-111 0l-1-70Z" fill={PAPER} />
    <ComicOutput metricName={metricName} />
    <path d="M130 81c30 2 66-3 101 0" fill="none" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" opacity=".55" />
  </svg>
);
