import React, { useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { FeedbackFab } from './FeedbackFab';
import { UnsavedChangesModal } from '../modals/UnsavedChangesModal';

export const Layout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const location = useLocation();

  // The shell persists between routes, including its scroll container. Reset
  // before paint so a long configure page cannot lend its scroll position to
  // a newly opened report.
  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--cr-shell)] text-[var(--cr-ink)]">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />

        {/* Padding lives on an INNER wrapper, not on the scroll container:
            content scrolls visibly through a scroll container's own padding,
            and sticky children pin below it — which exposed a bare strip
            above the sticky metrics tab bar where rows scrolled past it. */}
        {/* overflow-anchor:none — the metric pickers do their own collapse
            anchor compensation; Chrome's native scroll anchoring fights it. */}
        <main ref={mainRef} className="flex-1 overflow-y-auto bg-[var(--cr-bg)] [overflow-anchor:none]">
          <div className="px-4 py-7 pb-24 sm:px-6 md:py-9 lg:px-8 lg:pb-10">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav />

      <FeedbackFab />

      <UnsavedChangesModal />
    </div>
  );
};
