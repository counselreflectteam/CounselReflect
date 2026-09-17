import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useNavigationState } from '../../context/NavigationContext';
import { mainSteps, pipelineSteps } from '../../navigationConfig';

const navSteps = [...mainSteps.filter((step) => step.path === '/intro'), ...pipelineSteps].map((step) => ({
  ...step,
  shortLabel:
    step.path === '/intro' ? 'Home' :
    step.path === '/setup' ? 'Transcript' :
    step.path === '/configure' ? 'Criteria' : 'Report'
}));

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const { canNavigateTo } = useNavigationState();
  const isStepActive = (path: string) => location.pathname === path || (location.pathname === '/' && path === '/intro');

  return (
    <nav className="cr-glass fixed inset-x-0 bottom-0 z-50 border-t px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-1.5 lg:hidden" aria-label="Review workflow">
      <ul className="grid grid-cols-4 items-center">
        {navSteps.map((step) => {
          const isActive = isStepActive(step.path);
          const isDisabled = !canNavigateTo(step.step);

          return (
            <li key={step.path}>
              <NavLink
                to={step.path}
                onClick={(event) => {
                  if (isDisabled) event.preventDefault();
                }}
                aria-disabled={isDisabled || undefined}
                tabIndex={isDisabled ? -1 : undefined}
                className={`cr-focus relative mx-auto flex min-h-[52px] max-w-[76px] flex-col items-center justify-center px-2 text-[11px] ${
                  isActive
                    ? 'font-semibold text-[var(--cr-brand-primary)]'
                    : 'text-[var(--cr-ink-2)]'
                } ${isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
              >
                {isActive && <span className="absolute top-0 h-0.5 w-6 bg-[var(--cr-brand-primary)]" aria-hidden />}
                <span className="mb-0.5 flex h-5 items-center">{step.icon}</span>
                <span>{step.shortLabel}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
