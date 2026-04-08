import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { FeedbackFab } from './FeedbackFab';
import { UnsavedChangesModal } from '../modals/UnsavedChangesModal';

export const Layout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
      {/* Sidebar (hidden on mobile) */}
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto p-8 pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom Navigation (mobile only) */}
      <BottomNav />

      {/* Floating Feedback Action */}
      <FeedbackFab />

      {/* Unsaved Changes Warning Modal */}
      <UnsavedChangesModal />
    </div>
  );
};
