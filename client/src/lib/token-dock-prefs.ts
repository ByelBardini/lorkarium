import type { ChoiceStorage } from './stored-choice';

/** How the token dock shows the conditions: icon, name and rounds (`full`) or icon and rounds,
 *  the name on hover or focus (`compact`). */
export type ConditionsView = 'full' | 'compact';

/** One person's dock at one table: the height it was dragged to (`null`: its natural height, up
 *  to 45% of the panel) and how its conditions show. */
export type TokenDockPrefs = Readonly<{ height: number | null; conditions: ConditionsView }>;

export const DEFAULT_TOKEN_DOCK_PREFS: TokenDockPrefs = { height: null, conditions: 'full' };

/** The dock never gets lower than its head and a line of the detail. */
export const TOKEN_DOCK_MIN_HEIGHT = 96;

/** The tracker above always keeps about two rows. */
export const TOKEN_TRACKER_MIN_HEIGHT = 120;

/** One arrow press on the divider grows or shrinks the dock this many pixels. */
export const TOKEN_DOCK_HEIGHT_STEP = 24;

const CONDITIONS_VIEWS: readonly ConditionsView[] = ['full', 'compact'];

/** The storage key of one account's dock at one table: two people on one browser, or one person
 *  at two tables, keep their own.
 *
 *  Example: `tokenDockPrefsKey(userId, campaignId) // 'lorkarium.tokenDockLayout.<userId>.<campaignId>'` */
export function tokenDockPrefsKey(userId: string, campaignId: string): string {
  return `lorkarium.tokenDockLayout.${userId}.${campaignId}`;
}

/** The dock height kept between its minimum and what leaves the tracker its own, in whole pixels;
 *  on a panel too low for both, the dock's minimum wins.
 *
 *  Example: `clampTokenDockHeight(900, 700) // 580` */
export function clampTokenDockHeight(height: number, panelHeight: number): number {
  if (!Number.isFinite(height)) return TOKEN_DOCK_MIN_HEIGHT;
  const ceiling = Math.max(TOKEN_DOCK_MIN_HEIGHT, panelHeight - TOKEN_TRACKER_MIN_HEIGHT);
  return Math.min(ceiling, Math.max(TOKEN_DOCK_MIN_HEIGHT, Math.round(height)));
}

/** The dock preferences stored under `key`, each field that is missing or unknown at its default;
 *  a storage that throws gives the default (a preference is a convenience, never state).
 *
 *  Example: `readTokenDockPrefs(window.localStorage, key).conditions // 'full'` */
export function readTokenDockPrefs(storage: ChoiceStorage, key: string): TokenDockPrefs {
  try {
    return parsedPrefs(JSON.parse(storage.getItem(key) ?? 'null'));
  } catch {
    return DEFAULT_TOKEN_DOCK_PREFS;
  }
}

/** Remembers the dock preferences under `key`; a storage that throws keeps them in memory only.
 *
 *  Example: `writeTokenDockPrefs(window.localStorage, key, { height: 240, conditions: 'compact' })` */
export function writeTokenDockPrefs(
  storage: ChoiceStorage,
  key: string,
  prefs: TokenDockPrefs,
): void {
  try {
    storage.setItem(key, JSON.stringify(prefs));
  } catch {
    // Keeps working in memory for this visit.
  }
}

type StoredPrefs = Partial<Record<keyof TokenDockPrefs, unknown>> | null;

function parsedPrefs(stored: StoredPrefs): TokenDockPrefs {
  if (stored === null || typeof stored !== 'object') return DEFAULT_TOKEN_DOCK_PREFS;
  return {
    height: storedHeightOf(stored.height),
    conditions: CONDITIONS_VIEWS.find((view) => view === stored.conditions) ?? 'full',
  };
}

function storedHeightOf(height: unknown): number | null {
  return typeof height === 'number' && Number.isInteger(height) && height > 0 ? height : null;
}
