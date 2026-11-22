export const TAB_NAMES = ['tracker', 'target', 'fridge'] as const;
export type TabName = (typeof TAB_NAMES)[number];

// Arrow keys wrap around. Home and End jump to the first and last tab.
export function nextTab(current: TabName, key: string): TabName | null {
  const i = TAB_NAMES.indexOf(current);
  const n = TAB_NAMES.length;
  if (key === 'ArrowRight') return TAB_NAMES[(i + 1) % n];
  if (key === 'ArrowLeft') return TAB_NAMES[(i + n - 1) % n];
  if (key === 'Home') return TAB_NAMES[0];
  if (key === 'End') return TAB_NAMES[n - 1];
  return null;
}
