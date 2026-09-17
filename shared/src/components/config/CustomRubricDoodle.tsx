import React from 'react';

interface CustomRubricDoodleProps {
  className?: string;
  animated?: boolean;
}

const BLUE = 'var(--cr-sketch-blue, #176BFF)';
const BLUE_WASH = 'var(--cr-sketch-blue-wash, #DCEAFF)';
const CYAN = 'var(--cr-sketch-cyan, #12BFD0)';
const CORAL = 'var(--cr-sketch-coral, #F04F68)';
const PAPER = 'var(--cr-sketch-paper, #FFFBE8)';

const animationStyle = (index: number) => ({ '--cr-doodle-index': index } as React.CSSProperties);

const DrawnPath = ({ d, index, accent = false }: { d: string; index: number; accent?: boolean }) => (
  <path
    d={d}
    pathLength="1"
    style={animationStyle(index)}
    className={accent ? 'cr-rubric-doodle-accent' : 'cr-rubric-doodle-line'}
  />
);

/** A concrete sketch of transcript evidence becoming a scoring rubric. */
export const CustomRubricDoodle: React.FC<CustomRubricDoodleProps> = ({
  className = '',
  animated = true
}) => (
  <svg
    viewBox="0 0 184 92"
    fill="none"
    aria-hidden="true"
    focusable="false"
    data-custom-rubric-doodle
    data-animated={animated ? 'true' : 'false'}
    className={`cr-rubric-doodle overflow-visible ${className}`}
  >
    <path d="M7 10c25-4 51-2 70 1l-2 67c-22 3-45 1-67 0Z" fill={PAPER} opacity=".82" />
    <path d="M113 15c20-3 42-1 62 1l-1 63c-19 2-41 1-61-1Z" fill={BLUE_WASH} opacity=".66" />

    <g stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <DrawnPath d="M8 10c23-4 48-2 69 1l-2 67c-21 3-44 1-67 0Z" index={0} />
      <DrawnPath d="M17 22h31m-31 8h48m-48 9h39m-39 10h48m-48 9h33" index={1} />
      <DrawnPath d="M16 45c13-5 32-4 46 1-7 7-34 8-46-1Z" index={2} accent />
      <DrawnPath d="M83 44c8-6 15-7 23-2" index={3} />
      <DrawnPath d="M101 37l7 5-7 6" index={4} accent />
      <DrawnPath d="M113 15c20-3 42-1 62 1l-1 63c-19 2-41 1-61-1Z" index={5} />
      <DrawnPath d="M123 28h36m-36 9h27" index={6} />
      <DrawnPath d="M124 57h38m-38-5v11m19-11v11m19-11v11" index={7} />
      <DrawnPath d="M124 66c11-2 26 2 38-1" index={8} />
    </g>

    <g stroke={CYAN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="19" cy="18" r="4" fill={BLUE_WASH} />
      <DrawnPath d="M14 27c2-5 8-6 11-1" index={9} />
      <circle cx="58" cy="18" r="4" fill={PAPER} />
      <DrawnPath d="M53 27c2-5 8-6 11-1" index={10} />
    </g>

    <g stroke={CORAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <DrawnPath d="M137 70l20-37" index={11} accent />
      <DrawnPath d="M157 33l5-5 2 7-5 3Z" index={12} accent />
    </g>
  </svg>
);

