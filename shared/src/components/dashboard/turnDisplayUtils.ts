import { Role } from '@shared/types';

// Speakers render as quiet TEXT labels (design spec §3/§4) — no chip surface.
// The chatbot reads as the bold ink word; everyone else stays secondary ink.
// Hue lives in the small dot only.
export const getTurnRoleLabelClass = (role: Role) => {
  if (role === Role.Chatbot) {
    return 'font-bold text-[var(--cr-ink)]';
  }

  return 'font-normal text-[var(--cr-ink-2)]';
};

export const getTurnRoleDotClass = (role: Role) =>
  role === Role.Chatbot ? 'bg-brand-500' : 'bg-slate-400 dark:bg-slate-500';
