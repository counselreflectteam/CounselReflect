import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Lock, MessageCircle } from 'lucide-react';
import { useNavigationState } from '../../context/NavigationContext';
import { mainSteps, NavStep, pipelineSteps } from '../../navigationConfig';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const { canNavigateTo, isStepComplete } = useNavigationState();
  const homeStep = mainSteps.find((step) => step.path === '/intro');
  const resourceSteps = mainSteps.filter((step) => step.path !== '/intro');

  const renderNavItem = (step: NavStep, showNumber = false) => {
    const isActive = location.pathname.startsWith(step.path);
    const isDisabled = !canNavigateTo(step.step);
    const isComplete = isStepComplete(step.step);

    return (
      <li key={step.path} className="relative px-3">
        <NavLink
          to={step.path}
          onClick={(event) => {
            if (isDisabled) event.preventDefault();
          }}
          aria-disabled={isDisabled || undefined}
          tabIndex={isDisabled ? -1 : undefined}
          title={collapsed ? step.label : undefined}
          className={`cr-control cr-focus relative flex min-h-11 items-center rounded-md text-[14px] ${
            collapsed ? 'justify-center px-2' : 'px-3'
          } ${
            isActive
              ? 'bg-[#2468cf] font-semibold text-white'
              : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
          } ${isDisabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
        >
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center text-[13px] font-semibold ${
            isActive ? 'text-white' : 'text-slate-400'
          }`}>
            {isDisabled ? <Lock className="h-3.5 w-3.5" aria-hidden /> : showNumber ? step.step : step.icon}
          </span>

          {!collapsed && (
            <>
              <span className="ml-3 min-w-0 flex-1 truncate">{step.label}</span>
              {isComplete && !isActive && <Check className="h-3.5 w-3.5 shrink-0 text-[#8fd3b6]" aria-label="Complete" />}
            </>
          )}
        </NavLink>
      </li>
    );
  };

  return (
    <aside
      className={`relative hidden h-[100dvh] flex-shrink-0 flex-col bg-[#0d141c] lg:flex ${
        collapsed ? 'w-16' : 'w-[264px]'
      }`}
      style={{ transition: 'width 240ms cubic-bezier(0.22,1,0.36,1)' }}
    >
      <div className="flex h-16 items-center overflow-hidden border-b border-white/10 px-5">
        <img src="/logo.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
        {!collapsed && (
          <div className="ml-3 min-w-0">
            <p className="truncate text-[17px] font-semibold text-white">CounselReflect</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-5" aria-label="Primary navigation">
        {homeStep && <ul>{renderNavItem(homeStep)}</ul>}

        <div className="mt-6">
          {!collapsed && <p className="px-6 text-[12px] font-semibold text-slate-500">Review workflow</p>}
          <ul className="mt-2 space-y-1">
            {pipelineSteps.map((step) => renderNavItem(step, true))}
          </ul>
        </div>

        {resourceSteps.length > 0 && (
          <>
            <div className="mx-5 my-6 h-px bg-white/12" />
            <div>
              {!collapsed && <p className="px-6 text-[12px] font-semibold text-slate-500">Learn</p>}
              <ul className="mt-2 space-y-1">
                {resourceSteps.map((step) => renderNavItem(step))}
              </ul>
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-white/12 p-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('cr:open-feedback'))}
          className={`cr-control cr-focus flex h-10 w-full items-center rounded-lg text-sm text-white/65 hover:bg-white/7 hover:text-white ${
            collapsed ? 'justify-center px-0' : 'px-3'
          }`}
          title="Send feedback"
        >
          <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && <span className="ml-3">Send feedback</span>}
        </button>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="cr-control cr-focus absolute right-[-12px] top-1/2 z-10 flex h-11 w-6 -translate-y-1/2 items-center justify-center rounded-r-md bg-[#26303b] text-slate-300 shadow-sm hover:bg-[#33404d] hover:text-white"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>
    </aside>
  );
};
