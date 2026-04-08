import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigationState } from '../../context/NavigationContext';
import { mainSteps, pipelineSteps, NavStep } from '../../navigationConfig';


interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const location = useLocation();
  const { canNavigateTo } = useNavigationState();

  const renderNavItem = (step: NavStep, showNumber: boolean) => {
    const isActive = location.pathname.startsWith(step.path);
    const isDisabled = !canNavigateTo(step.step);

    return (
      <li key={step.path} className="px-3">
        <NavLink
          to={step.path}
          onClick={(e) => {
            if (isDisabled) e.preventDefault();
          }}
          className={`
            flex items-center rounded-lg
            transition-all duration-200 overflow-hidden whitespace-nowrap
            ${collapsed ? 'justify-center px-2 py-3.5' : 'px-4 py-3.5'}
            ${isActive ? 'bg-indigo-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'}
            ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div
            className={`
              min-w-8 h-8 rounded-full flex items-center justify-center
              text-sm font-semibold transition-all duration-200
              ${collapsed ? 'mr-0' : 'mr-3'}
              ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}
            `}
          >
            {showNumber ? step.step : step.icon}
          </div>

          <span className={`flex-1 transition-opacity duration-200 ml-3 font-medium ${collapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
            {step.label}
          </span>
        </NavLink>
      </li>
    );
  };

  return (
    <aside
      className={`
        hidden md:flex flex-col flex-shrink-0 h-screen relative
        bg-slate-900 text-white transition-all duration-300
        ${collapsed ? 'w-16' : 'w-[280px]'}
      `}
    >
      {/* Logo Area */}
      <div className="h-16 flex items-center px-5 border-b border-white/10 overflow-hidden whitespace-nowrap">
        <img src="/logo.png" alt="Logo" className="w-6 h-6 rounded mr-3 object-contain" />
        <span className={`font-semibold text-lg transition-opacity duration-200 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          CounselReflect
        </span>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1">
          {mainSteps.map((step) => renderNavItem(step, false))}

          <li className="px-3 pt-3 pb-1">
            <div className={`border-t border-slate-700 ${collapsed ? 'mx-2' : ''}`} />
          </li>

          {!collapsed && (
            <li className="px-6 pb-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                Evaluation Flow
              </span>
            </li>
          )}

          {pipelineSteps.map((step) => renderNavItem(step, true))}
        </ul>
      </nav>

      {/* Toggle Button - Centered on right edge */}
      <button
        onClick={onToggle}
        className="absolute top-1/2 -right-3 transform -translate-y-1/2 w-6 h-16 bg-indigo-600 hover:bg-indigo-500 text-white rounded-r-lg shadow-lg transition-all duration-200 flex items-center justify-center z-10 border-2 border-slate-900"
        title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
};
