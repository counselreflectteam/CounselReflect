import React from 'react';
import { Home, Settings, FileText, BarChart3, BookOpen } from 'lucide-react';

export interface NavStep {
  path: string;
  label: string;
  step: number;
  icon: React.ReactNode;
}

export const mainSteps: NavStep[] = [
  { path: '/paper', label: 'Paper', step: -1, icon: <BookOpen size={18} /> },
  { path: '/intro', label: 'Getting Started', step: 0, icon: <Home size={18} /> }
];

export const pipelineSteps: NavStep[] = [
  { path: '/setup', label: 'Setup', step: 1, icon: <Settings size={18} /> },
  { path: '/configure', label: 'Select Metrics', step: 2, icon: <FileText size={18} /> },
  { path: '/results', label: 'Results', step: 3, icon: <BarChart3 size={18} /> },
];
