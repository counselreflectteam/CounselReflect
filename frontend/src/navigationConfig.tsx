import React from 'react';

export interface NavStep {
  path: string;
  label: string;
  step: number;
  icon: React.ReactNode;
}

const SketchIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
    <g stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  </svg>
);

const HomeSketch = () => (
  <SketchIcon>
    <path d="M3.7 11.2c2.5-2.3 5.2-4.8 8.1-7.2 2.9 2.2 5.8 4.8 8.4 7.2" />
    <path d="M5.5 10.2c-.1 3.3.1 6.6.3 9.7 3.9.4 8.3.3 12.4-.1.2-3.3.2-6.7.1-9.8M9.5 19.7c-.1-2.4-.1-4.6.1-6.5 1.6-.2 3.2-.2 4.8 0 .2 2.1.2 4.2.1 6.5" />
  </SketchIcon>
);

const FileSketch = () => (
  <SketchIcon>
    <path d="M5.3 3.5c3.4-.3 7.1-.3 10.3 0 1 1.2 2 2.3 3.1 3.5.2 4.3.1 8.8-.3 13-4.2.4-8.6.4-12.9 0-.4-5.3-.5-11-.2-16.5Z" />
    <path d="M15.4 3.8c0 1.1.1 2.2.2 3.3 1 .1 2 .1 3 .1M8.6 13c2.1-.1 4.2-.1 6.3.1M11.7 9.8c0 2.2 0 4.4.1 6.5" />
  </SketchIcon>
);

const FocusSketch = () => (
  <SketchIcon>
    <path d="M4 6.1c4.9-.3 10.2-.2 16 .1M4.2 12.1c5.2-.2 10.4-.1 15.6.1M4.1 18.2c5.3-.2 10.6-.1 15.8.1" />
    <path d="M8 4.3c.6 1.2.6 2.6 0 3.8M15.8 10.2c.6 1.3.6 2.6 0 4M10.8 16.3c.5 1.2.5 2.5 0 3.8" />
  </SketchIcon>
);

const ReportSketch = () => (
  <SketchIcon>
    <path d="M4.2 19.8c-.3-4.8-.3-10.2 0-15.6M4.2 19.8c5.2.3 10.5.3 15.8 0" />
    <path d="M7.5 16.7c-.1-2.1 0-4 .2-5.7 1-.1 2-.1 3 0 .2 1.7.2 3.7 0 5.7M12.3 16.8c-.1-3.5 0-6.6.2-9.2 1.1-.2 2.2-.2 3.2 0 .2 2.8.2 5.8 0 9.2M17.1 16.8c0-1.5 0-2.9.2-4.2 1-.1 1.9-.1 2.7 0" />
  </SketchIcon>
);

export const mainSteps: NavStep[] = [
  { path: '/intro', label: 'Home', step: 0, icon: <HomeSketch /> }
];

export const pipelineSteps: NavStep[] = [
  { path: '/setup', label: 'Add transcript', step: 1, icon: <FileSketch /> },
  { path: '/configure', label: 'Evaluation criteria', step: 2, icon: <FocusSketch /> },
  { path: '/results', label: 'Report', step: 3, icon: <ReportSketch /> }
];
