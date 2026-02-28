import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@shared/context';

export const Header: React.FC = () => {
  const { isDarkMode, toggleDarkMode } = useTheme();
  
  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-1.5 rounded-lg transition-colors">
            <img 
              src="/logo.png" 
              alt="CounselReflect" 
              className="w-8 h-8"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">CounselReflect</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Mental Health Analytics</p>
          </div>
        </div>

        <div className="flex items-center space-x-6">
            <button
              onClick={toggleDarkMode}
              className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
        </div>
      </div>
    </header>
  );
};