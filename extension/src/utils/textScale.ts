/**
 * Sidebar text-size preference.
 *
 * The whole type scale is rem-based (see index.css — px font sizes are
 * banned), so scaling the root font-size scales every label, button and
 * report body together. The root override is a PERCENTAGE, never px, so a
 * user's browser-level font-size setting keeps compounding with ours.
 *
 * The choice is mirrored into chrome.storage.local so the content script can
 * scale the on-page score tooltip to match (see content.js / tooltip.js).
 */

declare const chrome: any;

export type TextScaleStep = 'default' | 'large' | 'xl';

export interface TextScaleOption {
  step: TextScaleStep;
  label: string;
  /** Root font-size, as % of the browser default (100 = 16px normally). */
  percent: number;
  /** Zoom factor for host-page tooltip UI (content-script side). */
  zoom: number;
}

export const TEXT_SCALE_OPTIONS: readonly TextScaleOption[] = [
  { step: 'default', label: 'Default', percent: 100, zoom: 1 },
  { step: 'large', label: 'Large', percent: 112.5, zoom: 1.125 },
  { step: 'xl', label: 'Extra large', percent: 125, zoom: 1.25 },
];

const STORAGE_KEY = 'textScale';

const isTextScaleStep = (value: unknown): value is TextScaleStep =>
  TEXT_SCALE_OPTIONS.some((option) => option.step === value);

/* Out-of-the-box step. 'large' (112.5%, body ~14.6px): study participants
   reported the 13px default too small next to the host page's 16px body,
   and first impressions can't rely on anyone finding the Aa control.
   An explicit user choice (localStorage) always wins over this. */
const FALLBACK_STEP: TextScaleStep = 'large';

export function getStoredTextScaleStep(): TextScaleStep {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTextScaleStep(stored) ? stored : FALLBACK_STEP;
  } catch {
    return FALLBACK_STEP;
  }
}

export function applyTextScaleStep(step: TextScaleStep): void {
  const option = TEXT_SCALE_OPTIONS.find((candidate) => candidate.step === step)
    ?? TEXT_SCALE_OPTIONS[0];
  // 'default' clears the override entirely so the browser's own setting rules.
  document.documentElement.style.fontSize =
    option.percent === 100 ? '' : `${option.percent}%`;
}

export function setTextScaleStep(step: TextScaleStep): void {
  try {
    localStorage.setItem(STORAGE_KEY, step);
  } catch {
    // Storage full/blocked — still apply for this session.
  }
  applyTextScaleStep(step);
  try {
    if (typeof chrome !== 'undefined') chrome?.storage?.local?.set({ [STORAGE_KEY]: step });
  } catch {
    // Not fatal: the on-page tooltip just keeps its current scale.
  }
}

/** Apply the persisted preference before first paint (called from sidebar.tsx). */
export function initTextScale(): void {
  applyTextScaleStep(getStoredTextScaleStep());
  // Sidebars in other tabs share this extension origin's localStorage; the
  // 'storage' event fires here when one of them changes the preference, so
  // every open sidebar re-scales together with its on-page tooltip (which
  // follows chrome.storage.onChanged in content.js).
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      applyTextScaleStep(getStoredTextScaleStep());
    }
  });
}
