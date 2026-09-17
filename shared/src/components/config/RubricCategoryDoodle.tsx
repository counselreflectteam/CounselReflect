import React from 'react';

interface RubricCategoryDoodleProps {
  category: string;
  animated?: boolean;
  className?: string;
}

const BLUE = 'var(--cr-sketch-blue, #176BFF)';
const BLUE_WASH = 'var(--cr-sketch-blue-wash, #DCEAFF)';
const INK = 'var(--cr-sketch-ink, #12305A)';
const YELLOW = 'var(--cr-sketch-yellow, #FFF2B0)';
const PAPER = 'var(--cr-sketch-paper, #FFFBE8)';

const animationStyle = (index: number) => ({ '--cr-doodle-index': index } as React.CSSProperties);

const Line = ({ d, index = 0, accent = false }: { d: string; index?: number; accent?: boolean }) => (
  <path
    d={d}
    pathLength="1"
    className={accent ? 'cr-rubric-doodle-accent' : 'cr-rubric-doodle-line'}
    style={animationStyle(index)}
  />
);

const Circle = ({ cx, cy, r, index = 0, accent = false, fill = 'none' }: {
  cx: number;
  cy: number;
  r: number;
  index?: number;
  accent?: boolean;
  fill?: string;
}) => (
  <circle
    cx={cx}
    cy={cy}
    r={r}
    fill={fill}
    pathLength="1"
    className={accent ? 'cr-rubric-doodle-accent' : 'cr-rubric-doodle-line'}
    style={animationStyle(index)}
  />
);

const AdvancedSkills = () => (
  <>
    <path d="M5 13c4-6 12-6 16 0v12c-4 5-12 5-16 0Z" fill={BLUE_WASH} opacity=".75" />
    <g stroke={BLUE}>
      <Circle cx={13} cy={18} r={4.5} />
      <Line d="M6 31c4-6 11-7 16-1" index={1} />
      <Line d="M23 17c5-3 9-2 13 1" index={2} />
      <Circle cx={44} cy={21} r={9} index={3} fill={PAPER} />
      <Line d="M50 28l8 8" index={4} />
      <Line d="M40 21c1-5 8-4 8 0 0 4-6 5-7 1-1-3 3-5 5-3" index={5} accent />
    </g>
  </>
);

const CBTTechniques = () => (
  <>
    <path d="M4 7h28v18H15l-6 5 1-6H4Z" fill={PAPER} opacity=".9" />
    <g stroke={BLUE}>
      <Line d="M4 8c8-3 20-2 27 0l1 16c-7 2-13 0-18 1l-6 5 1-6H4Z" />
      <Line d="M10 16c2-5 5 5 8 0s5 4 8-1" index={1} />
      <Line d="M34 19c4 0 5 1 7 4" index={2} accent />
      <Line d="M42 32h6v-6h6v-7h6" index={3} />
      <Line d="M44 28l2 2 4-5m1-3 2 2 4-5" index={4} accent />
    </g>
  </>
);

const CommunicationSkills = () => (
  <>
    <g stroke={BLUE}>
      <Circle cx={13} cy={28} r={6} fill={BLUE_WASH} />
      <Circle cx={51} cy={28} r={6} index={1} fill={PAPER} />
      <Line d="M4 41c4-8 14-8 19 0m18 0c4-8 14-8 19 0" index={2} />
      <Line d="M6 8c7-4 17-3 21 2l-2 9-13 1-5 4 1-6c-4-3-4-7-2-10Z" index={3} />
      <Line d="M58 9c-6-4-15-3-19 1l2 9 11 1 5 4-1-6c4-3 4-6 2-9Z" index={4} />
      <Line d="M14 13h7m22 1h8" index={5} accent />
    </g>
  </>
);

const CoreConditions = () => (
  <>
    <path d="M21 12c3-8 11-3 11 2 2-7 11-5 11 1 0 8-11 14-11 14S20 21 21 12Z" fill={YELLOW} opacity=".85" />
    <g stroke={BLUE}>
      <Circle cx={14} cy={27} r={5.5} fill={BLUE_WASH} />
      <Circle cx={50} cy={27} r={5.5} index={1} fill={BLUE_WASH} />
      <Line d="M5 42c4-9 14-10 20-2m14 0c6-8 16-7 20 2" index={2} />
      <Line d="M21 13c2-8 10-4 11 2 2-7 11-5 11 1 0 7-11 13-11 13S20 21 21 13Z" index={3} accent />
      <Line d="M21 34c6 5 16 5 22 0" index={4} />
    </g>
  </>
);

const CrisisTrauma = () => (
  <>
    <path d="M12 23c6-14 29-16 39 0-6-2-9-1-13 2-4-4-8-4-12 0-5-3-9-3-14-2Z" fill={BLUE_WASH} opacity=".85" />
    <g stroke={BLUE}>
      <Line d="M11 23c7-15 30-16 41 0-6-2-10-1-14 2-4-4-8-4-12 0-5-3-10-3-15-2Z" />
      <Line d="M32 8v28c0 8 8 8 9 2" index={1} />
      <Circle cx={25} cy={32} r={4} index={2} fill={PAPER} />
      <Line d="M18 43c3-7 11-8 15-2" index={3} />
      <Line d="M5 7l5 5-4 4m48-9-4 6 5 2" index={4} accent />
    </g>
  </>
);

const EmotionProcessing = () => (
  <>
    <path d="M5 9h29v29H5Z" fill={PAPER} opacity=".75" />
    <g stroke={BLUE}>
      <Circle cx={19} cy={23} r={13} fill={BLUE_WASH} />
      <Line d="M13 20h1m10 0h1m-11 9c3-4 8-4 11 0" index={1} />
      <Line d="M27 21c4 5-1 9-3 5-1-2 1-4 3-5Z" index={2} accent />
      <Line d="M35 14c5-4 10 2 7 6 5-3 10 3 6 7-4 4-10 7-15 9" index={3} />
      <Line d="M38 36c7 2 14 0 21-3" index={4} accent />
    </g>
  </>
);

const MITechniques = () => (
  <>
    <g stroke={BLUE}>
      <Circle cx={12} cy={28} r={5.5} fill={BLUE_WASH} />
      <Line d="M4 42c4-9 14-10 20-2" index={1} />
      <Line d="M18 22c6-8 13-10 20-8" index={2} />
      <Line d="M38 14c7 0 12-4 18-9m-18 9c7 0 12 5 18 10" index={3} />
      <Line d="M52 5l4 0-1 4m-3 15h4l-1-4" index={4} accent />
      <Line d="M25 5c6-3 13-1 16 3l-3 9-8 1-5 4 1-6c-4-3-4-7-1-11Z" index={5} />
      <Line d="M30 10h6" index={6} accent />
    </g>
  </>
);

const MindfulnessBody = () => (
  <>
    <path d="M18 29c3-11 25-11 29 0l-6 9H24Z" fill={BLUE_WASH} opacity=".8" />
    <g stroke={BLUE}>
      <Circle cx={32} cy={13} r={5} fill={PAPER} />
      <Line d="M32 18v13m0-7-9 9m9-9 9 9m-18 0-7 8m25-8 7 8M13 42c12-2 28 2 39-1" index={1} />
      <Line d="M12 11c4-5 9-6 14-4m26 4c-4-5-9-6-14-4" index={2} accent />
      <Line d="M7 17c6 3 12 3 18 0m14 0c6 3 12 3 18 0" index={3} />
    </g>
  </>
);

const RelationshipRepair = () => (
  <>
    <g stroke={BLUE}>
      <Circle cx={11} cy={30} r={5.5} fill={BLUE_WASH} />
      <Circle cx={53} cy={30} r={5.5} index={1} fill={PAPER} />
      <Line d="M3 43c4-8 13-9 18-2m22 0c5-7 14-7 18 2" index={2} />
      <Line d="M17 12c6-6 12-3 15 2 3-5 10-7 15-1" index={3} />
      <Line d="M17 12c5 11 15 17 15 17s10-6 15-16" index={4} />
      <Line d="M28 12l7 7m-7 0 7-7m2 4 5 5" index={5} accent />
    </g>
  </>
);

const SessionManagement = () => (
  <>
    <path d="M6 5h37v38H6Z" fill={PAPER} opacity=".85" />
    <g stroke={BLUE}>
      <Line d="M7 5c10-2 25-1 36 0l1 37c-12 2-24 0-37 1Z" />
      <Line d="M14 14h17m-17 8h19m-19 8h13" index={1} />
      <Line d="M11 13l1 2 3-4m-4 10 1 2 3-4m-4 10 1 2 3-4" index={2} accent />
      <Circle cx={50} cy={31} r={9} index={3} fill={BLUE_WASH} />
      <Line d="M50 25v7l5 3" index={4} accent />
    </g>
  </>
);

const SolutionFocused = () => (
  <>
    <g stroke={BLUE}>
      <Circle cx={8} cy={36} r={4.5} fill={BLUE_WASH} />
      <Line d="M3 46c2-7 9-9 13-3" index={1} />
      <Line d="M17 39l7-2 2-7 8 1 3-8 8 1" index={2} />
      <Line d="M45 24V7" index={3} />
      <Line d="M45 8c5-3 10 1 15-1v10c-5 2-10-2-15 1" index={4} accent />
      <Line d="M18 30c3-6 7-9 13-11" index={5} accent />
      <Line d="M28 17l4 2-2 4" index={6} accent />
    </g>
  </>
);

const DRAWINGS: Record<string, React.FC> = {
  'Advanced Skills': AdvancedSkills,
  'CBT Techniques': CBTTechniques,
  'Communication Skills': CommunicationSkills,
  'Core Conditions': CoreConditions,
  'Crisis & Trauma': CrisisTrauma,
  'Emotion Processing': EmotionProcessing,
  'MI Techniques': MITechniques,
  'Mindfulness & Body': MindfulnessBody,
  'Relationship Repair': RelationshipRepair,
  'Session Management': SessionManagement,
  'Solution-Focused': SolutionFocused
};

export const RubricCategoryDoodle: React.FC<RubricCategoryDoodleProps> = ({
  category,
  animated = false,
  className = ''
}) => {
  const Drawing = DRAWINGS[category] || CommunicationSkills;

  return (
    <svg
      viewBox="0 0 64 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-rubric-category={category}
      data-animated={animated ? 'true' : 'false'}
      className={`cr-rubric-doodle shrink-0 overflow-visible ${className}`}
    >
      <g
        fill="none"
        stroke={BLUE}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Drawing />
      </g>
      <path d="M5 46c14-2 37 2 54-1" stroke={INK} strokeWidth=".8" strokeLinecap="round" opacity=".16" />
    </svg>
  );
};
