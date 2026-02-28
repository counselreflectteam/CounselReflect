// Emotion Color Palette for visualization
export const EMOTION_COLORS: Record<string, { bg: string; text: string; border: string; mark: string }> = {
  'joy': { 
    bg: 'bg-yellow-100', 
    text: 'text-yellow-800', 
    border: 'border-yellow-200', 
    mark: 'bg-yellow-200 dark:bg-yellow-900/60 dark:text-yellow-100' 
  },
  'sadness': { 
    bg: 'bg-indigo-100', 
    text: 'text-indigo-800', 
    border: 'border-indigo-200', 
    mark: 'bg-indigo-200 dark:bg-indigo-900/60 dark:text-indigo-100' 
  },
  'anger': { 
    bg: 'bg-red-100', 
    text: 'text-red-800', 
    border: 'border-red-200', 
    mark: 'bg-red-200 dark:bg-red-900/60 dark:text-red-100' 
  },
  'fear': { 
    bg: 'bg-purple-100', 
    text: 'text-purple-800', 
    border: 'border-purple-200', 
    mark: 'bg-purple-200 dark:bg-purple-900/60 dark:text-purple-100' 
  },
  'surprise': { 
    bg: 'bg-pink-100', 
    text: 'text-pink-800', 
    border: 'border-pink-200', 
    mark: 'bg-pink-200 dark:bg-pink-900/60 dark:text-pink-100' 
  },
  'disgust': { 
    bg: 'bg-emerald-100', 
    text: 'text-emerald-800', 
    border: 'border-emerald-200', 
    mark: 'bg-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-100' 
  },
  'neutral': { 
    bg: 'bg-slate-100', 
    text: 'text-slate-800', 
    border: 'border-slate-200', 
    mark: 'bg-slate-200 dark:bg-slate-700 dark:text-slate-200' 
  },
};

export const getEmotionColor = (label: string) => {
  const lower = label.toLowerCase();
  return EMOTION_COLORS[lower] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200',
    mark: 'bg-yellow-200 dark:bg-yellow-800/50 dark:text-yellow-100'
  };
};

// Colors for pie chart
export const CHART_COLORS = ['#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#f59e0b', '#ef4444'];
