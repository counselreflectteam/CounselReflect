import React from 'react';

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Core Conditions': { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  'Communication Skills': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  'CBT Techniques': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  'MI Techniques': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  'Session Management': { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
  'Advanced Skills': { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
  'Relationship Repair': { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-800' },
  'Emotion Processing': { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-200 dark:border-fuchsia-800' },
  'Mindfulness & Body': { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
  'Solution-Focused': { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-300', border: 'border-lime-200 dark:border-lime-800' },
  'Crisis & Trauma': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
  'Other': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-600' },
};

export const getCategoryColors = (category: string) => {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
};


export const CategoryBadge: React.FC<{ category: string, className?: string }> = ({ category, className = "" }) => {
  const colors = getCategoryColors(category);
  return (
    <span className={`rounded-full font-medium ${colors.bg} ${colors.text} ${className}`}>
      {category}
    </span>
  );
};

export interface CategoryFilterItemProps {
  category: string;
  isSelected: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleCategory: () => void;
  onToggleAllInGroup: (e: React.MouseEvent) => void;
  areAllSelected: boolean;
}

export const CategoryFilterItem: React.FC<CategoryFilterItemProps> = ({
  category,
  isSelected,
  selectedCount,
  totalCount,
  onToggleCategory,
  onToggleAllInGroup,
  areAllSelected
}) => {
  const colors = getCategoryColors(category);
  
  return (
    <div className="flex items-center gap-0">
      <button
        onClick={onToggleCategory}
        className={`px-3 py-1.5 rounded-l-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
          isSelected
            ? `${colors.bg} ${colors.text} ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-slate-800`
            : `${colors.bg} ${colors.text} hover:ring-1 hover:ring-slate-300 dark:hover:ring-slate-600`
        }`}
      >
        <span>{category}</span>
        <span className={`${isSelected ? 'bg-white/30' : 'bg-black/10 dark:bg-white/10'} px-1.5 py-0.5 rounded text-[10px]`}>
          {selectedCount}/{totalCount}
        </span>
      </button>
      <button
        onClick={onToggleAllInGroup}
        className={`px-2 py-1.5 rounded-r-lg text-[10px] font-medium transition-all border-l ${colors.bg} ${colors.text} hover:bg-opacity-80`}
        title={areAllSelected ? 'Deselect all' : 'Select all'}
      >
        {areAllSelected ? '✕' : '✓'}
      </button>
    </div>
  );
};
