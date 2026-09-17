import React from 'react';

interface LoadingMarkProps {
  className?: string;
}

interface LoadingDoodleProps extends LoadingMarkProps {
  completedCount?: number;
  failedCount?: number;
}

/** A small hand-drawn activity mark for compact status labels and metric rows. */
export const EvaluationLoadingMark: React.FC<LoadingMarkProps> = ({
  className = 'h-4 w-4'
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={`shrink-0 overflow-visible ${className}`}
    aria-hidden="true"
    focusable="false"
    data-evaluation-loading-mark
  >
    <g
      className="origin-center motion-safe:animate-spin"
      style={{ animationDuration: '1.65s' }}
    >
      <path
        d="M4.3 12.7C3.8 7.8 7.4 3.9 12 3.8c3.7-.1 6.8 2 7.9 5.1"
        stroke="#176BFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 12.1c.1 4.7-3.5 8.1-7.8 8.2-2.6.1-5-1-6.5-2.9"
        stroke="#12BFD0"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M18.7 6.6l1.5 2.5-2.8.5"
        stroke="#F04F68"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <path
      d="M10 11.9c1.1-.8 2.5-.8 3.7-.1"
      stroke="#12305A"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="motion-safe:animate-pulse"
    />
  </svg>
);

/** A playful but restrained notebook-and-pencil scene for the main run status. */
export const EvaluationLoadingDoodle: React.FC<LoadingDoodleProps> = ({
  className = 'h-16 w-24',
  completedCount = 0,
  failedCount = 0
}) => {
  const recentOutcomes: Array<'completed' | 'failed' | 'waiting'> = [
    ...Array(Math.min(completedCount, 2)).fill('completed'),
    ...Array(Math.min(failedCount, 2)).fill('failed')
  ].slice(-2) as Array<'completed' | 'failed'>;

  while (recentOutcomes.length < 2) recentOutcomes.push('waiting');

  return (
    <svg
    viewBox="0 0 112 68"
    fill="none"
    className={`shrink-0 overflow-visible ${className}`}
    aria-hidden="true"
    focusable="false"
    data-evaluation-loading-doodle
  >
    <path
      d="M16.4 8.2c19.7-1.5 43.2-.7 64.3 1 1.6 15.5 1 33.7-1.3 49.4-20.8 1.6-42.9.8-63.6-1.2-1.4-16.2-1.1-32.9.6-49.2Z"
      fill="#F8FBFF"
      stroke="#176BFF"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19 10c19.2-1 40.9-.2 59.5 1.2"
      stroke="#176BFF"
      strokeWidth=".8"
      strokeLinecap="round"
      opacity=".24"
    />

    <path
      d="M32 22.1c10.4-.8 21.7-.5 32.5.2M32 34.2c12.4-.6 25-.2 36.7.4"
      stroke="#DCEAFF"
      strokeWidth="5.8"
      strokeLinecap="round"
    />
    <path
      d="M32 46.6c10.8-.7 23.3-.3 35.1.3"
      stroke="#FFF0A8"
      strokeWidth="6.4"
      strokeLinecap="round"
      className="motion-safe:animate-pulse"
      style={{ animationDuration: '1.9s' }}
    />
    <path
      d="M32 21.8c10.7-.4 21.6-.2 32.3.4M32.1 34.1c12-.4 24.3-.1 36.2.5M32 46.5c10.9-.4 22.6-.1 34.8.5"
      stroke="#12305A"
      strokeWidth="1.15"
      strokeLinecap="round"
      opacity=".62"
    />

    {recentOutcomes.map((outcome, index) => {
      const y = index === 0 ? 21.8 : 34;
      if (outcome === 'completed') {
        return (
          <path
            key={`${outcome}-${index}`}
            d={`M21.8 ${y - 0.4}l2.6 2.7 4.9-6.2`}
            stroke="#20A57A"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      }

      if (outcome === 'failed') {
        return (
          <g key={`${outcome}-${index}`} stroke="#F04F68" strokeLinecap="round">
            <path d={`M21.8 ${y - 2.6}c1.8-.8 4.1-.6 5.5.6 1.4 1.3 1.3 3.6-.1 4.8-1.6 1.3-4.2 1-5.5-.5-1.2-1.4-1.1-3.8.1-4.9Z`} strokeWidth="1.4" />
            <path d={`m23.1 ${y - 1.2} 3.1 3M26.2 ${y - 1.2}l-3.1 3`} strokeWidth="1.2" />
          </g>
        );
      }

      return (
        <path
          key={`${outcome}-${index}`}
          d={`M21.9 ${y - 2.6}c1.8-.8 4.1-.6 5.5.6 1.4 1.3 1.3 3.6-.1 4.8-1.6 1.3-4.2 1-5.5-.5-1.2-1.4-1.1-3.8.1-4.9Z`}
          stroke="#9CB3CE"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      );
    })}
    <path
      d="M22 43.8c1.8-.8 4.1-.6 5.5.6 1.4 1.3 1.3 3.6-.1 4.8-1.6 1.3-4.2 1-5.5-.5-1.2-1.4-1.1-3.8.1-4.9Z"
      stroke="#F04F68"
      strokeWidth="1.5"
      strokeLinecap="round"
    />

    <g
      className="motion-safe:animate-bounce"
      style={{ animationDuration: '1.7s' }}
      data-evaluation-pencil
    >
      <path
        d="M74.4 45.6 94 25.7l6 5.7-20.2 19.5-7.2 2.4 1.8-7.7Z"
        fill="#FFD23F"
        stroke="#12305A"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m94 25.7 3.2-3.1 6 5.8-3.2 3M74.4 45.6l5.4 5.3-7.2 2.4 1.8-7.7Z"
        fill="#FF8DA0"
        stroke="#12305A"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m72.6 53.3 2.5-.8-1.7-1.7-.8 2.5Z" fill="#12305A" />
      <path
        d="M78.8 43.4 84 48.5"
        stroke="#F8FBFF"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity=".75"
      />
    </g>

    <path
      d="m96.4 10.6 1.1 3.1 3.2.8-3 1.3-.5 3.3-1.2-3-3.3-.6 3-1.4.7-3.5ZM88.3 17.7l.5 1.7 1.8.4-1.6.8-.3 1.8-.7-1.7-1.8-.3 1.6-.8.5-1.9Z"
      fill="#F04F68"
      className="motion-safe:animate-pulse"
      style={{ animationDuration: '1.3s' }}
    />
    <path
      d="M84.8 58.2c5.3.8 10.8.5 15.6-.8"
      stroke="#12BFD0"
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity=".8"
    />
    </svg>
  );
};
