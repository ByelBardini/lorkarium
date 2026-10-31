import type { ChoiceStorage } from './stored-choice';

/** How the template editor is laid out: the share of the width the code takes beside the
 *  preview (a percentage), whether the console under the preview is open and its height (px). */
export type SheetEditorLayout = Readonly<{
  codeShare: number;
  consoleOpen: boolean;
  consoleHeight: number;
}>;

export const SHEET_EDITOR_CODE_SHARE_MIN = 25;
export const SHEET_EDITOR_CODE_SHARE_MAX = 75;
export const SHEET_CONSOLE_HEIGHT_MIN = 96;
export const SHEET_CONSOLE_HEIGHT_MAX = 480;
export const DEFAULT_SHEET_EDITOR_LAYOUT: SheetEditorLayout = {
  codeShare: 60,
  consoleOpen: true,
  consoleHeight: 192,
};

/** Where the editor's layout is remembered between visits; a convenience, never state. */
export interface SheetEditorLayoutMemory {
  read(): SheetEditorLayout;
  write(layout: SheetEditorLayout): void;
}

/** The code share kept inside its bounds, rounded to a whole percent.
 *
 *  Example: `clampCodeShare(90) // 75` */
export function clampCodeShare(share: number): number {
  if (!Number.isFinite(share)) return DEFAULT_SHEET_EDITOR_LAYOUT.codeShare;
  const whole = Math.round(share);
  return Math.min(SHEET_EDITOR_CODE_SHARE_MAX, Math.max(SHEET_EDITOR_CODE_SHARE_MIN, whole));
}

/** The console's height kept inside its bounds, in whole pixels.
 *
 *  Example: `clampConsoleHeight(1000) // 480` */
export function clampConsoleHeight(height: number): number {
  if (!Number.isFinite(height)) return DEFAULT_SHEET_EDITOR_LAYOUT.consoleHeight;
  const whole = Math.round(height);
  return Math.min(SHEET_CONSOLE_HEIGHT_MAX, Math.max(SHEET_CONSOLE_HEIGHT_MIN, whole));
}

/** The storage key of one person's layout: two masters on one browser keep their own. */
export function sheetEditorLayoutKey(userId: string | null): string {
  return `lorkarium.sheetEditor.layout.${userId ?? 'anonymous'}`;
}

type StoredLayout = Partial<Record<keyof SheetEditorLayout, unknown>> | null;

function storedNumber(value: unknown, clamp: (value: number) => number, fallback: number): number {
  return typeof value === 'number' ? clamp(value) : fallback;
}

function parsedLayout(text: string | null): SheetEditorLayout {
  if (text === null) return DEFAULT_SHEET_EDITOR_LAYOUT;
  const stored = JSON.parse(text) as StoredLayout;
  const fallback = DEFAULT_SHEET_EDITOR_LAYOUT;
  return {
    codeShare: storedNumber(stored?.codeShare, clampCodeShare, fallback.codeShare),
    consoleOpen:
      typeof stored?.consoleOpen === 'boolean' ? stored.consoleOpen : fallback.consoleOpen,
    consoleHeight: storedNumber(stored?.consoleHeight, clampConsoleHeight, fallback.consoleHeight),
  };
}

/** The editor's layout in `localStorage`, per person (`userId()` read at each call). A storage
 *  that throws or holds something else gives the default and keeps the change in memory only.
 *
 *  Example: `storedSheetEditorLayout(window.localStorage, () => currentUserId).read()` */
export function storedSheetEditorLayout(
  storage: ChoiceStorage,
  userId: () => string | null,
): SheetEditorLayoutMemory {
  return {
    read: () => {
      try {
        return parsedLayout(storage.getItem(sheetEditorLayoutKey(userId())));
      } catch {
        return DEFAULT_SHEET_EDITOR_LAYOUT;
      }
    },
    write: (layout) => {
      try {
        storage.setItem(sheetEditorLayoutKey(userId()), JSON.stringify(layout));
      } catch {
        // Keeps working in memory for this visit.
      }
    },
  };
}
