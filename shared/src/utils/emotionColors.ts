// Emotion color palette for visualization — quiet-chip form (tinted bg,
// colored text). Hues stay on the spec palette (amber/blue/rose/emerald/slate)
// except fear=violet and surprise=sky: emotions are data-viz where hue carries
// meaning, and two extra families keep all seven distinguishable.
// colored text, no hard border) with dark-mode variants baked in.
// NOTE: every class must appear as a complete literal string — Tailwind's
// scanner cannot see classes assembled at runtime (e.g. `${border}/50`),
// which is why the softened border variants are spelled out in borderSoft.
export const EMOTION_COLORS: Record<string, { bg: string; text: string; border: string; borderSoft: string; mark: string }> = {
  'joy': {
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-500/30',
    borderSoft: 'border-amber-300/60 dark:border-amber-500/40',
    mark: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100'
  },
  'sadness': {
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-500/30',
    borderSoft: 'border-blue-300/60 dark:border-blue-500/40',
    mark: 'bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-100'
  },
  'anger': {
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-500/30',
    borderSoft: 'border-rose-300/60 dark:border-rose-500/40',
    mark: 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100'
  },
  'fear': {
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-200 dark:border-violet-500/30',
    borderSoft: 'border-violet-300/60 dark:border-violet-500/40',
    mark: 'bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100'
  },
  'surprise': {
    bg: 'bg-sky-50 dark:bg-sky-500/10',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-200 dark:border-sky-500/30',
    borderSoft: 'border-sky-300/60 dark:border-sky-500/40',
    mark: 'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100'
  },
  'disgust': {
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    borderSoft: 'border-emerald-300/60 dark:border-emerald-500/40',
    mark: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100'
  },
  'neutral': {
    bg: 'bg-slate-100 dark:bg-slate-500/10',
    text: 'text-slate-600 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-500/30',
    borderSoft: 'border-slate-300/60 dark:border-slate-500/40',
    mark: 'bg-slate-200 text-slate-800 dark:bg-slate-500/20 dark:text-slate-100'
  },
};

export const getEmotionColor = (label: string) => {
  const lower = label.toLowerCase();
  return EMOTION_COLORS[lower] || {
    bg: 'bg-slate-100 dark:bg-slate-500/10',
    text: 'text-slate-600 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-500/30',
    borderSoft: 'border-slate-300/60 dark:border-slate-500/40',
    mark: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100'
  };
};

// Chart palette per design spec §4: brand (blue) ramp + slate steps + one
// semantic warm foil. Nothing outside these families.
export const CHART_COLORS = ['#2563EB', '#60A5FA', '#1E40AF', '#94A3B8', '#475569', '#D97706'];
