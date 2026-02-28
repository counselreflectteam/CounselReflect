import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Settings, FileText, BarChart3 } from 'lucide-react';
import { useNavigationState } from '../../context/NavigationContext';

interface NavStep {
  path: string;
  label: string;
  step: number;
  icon: React.ReactNode;
}

const navSteps: NavStep[] = [
  { path: '/intro', label: 'Getting Started', step: 0, icon: <Home size={20} /> },
  { path: '/setup', label: 'Setup', step: 1, icon: <Settings size={20} /> },
  { path: '/configure', label: 'Metrics', step: 2, icon: <FileText size={20} /> },
  { path: '/results', label: 'Results', step: 3, icon: <BarChart3 size={20} /> },
];

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const { canNavigateTo } = useNavigationState();

  const isStepActive = (path: string) => location.pathname === path || (location.pathname === '/' && path === '/intro');

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-2 z-50">
      <ul className="flex justify-around items-center">
        {navSteps.map((step) => {
          const isActive = isStepActive(step.path);
          const canNavigate = canNavigateTo(step.step);
          const isDisabled = !canNavigate;

          return (
            <li key={step.path}>
              <NavLink
                to={step.path}
                onClick={(e) => {
                  if (isDisabled) {
                    e.preventDefault();
                  }
                }}
                className={`
                  flex flex-col items-center px-4 py-2 text-xs transition-all duration-200
                  ${isActive 
                    ? 'text-indigo-600 dark:text-indigo-400' 
                    : 'text-slate-500 dark:text-slate-400'}
                  ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <span className="mb-1">{step.icon}</span>
                <span>{step.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
