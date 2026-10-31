import { useCallback, useState } from 'react';
import {
  clampCodeShare,
  clampConsoleHeight,
  DEFAULT_SHEET_EDITOR_LAYOUT,
  type SheetEditorLayout,
  type SheetEditorLayoutMemory,
} from '@/lib/sheet-editor-layout';

export type SheetEditorLayoutModel = Readonly<{
  layout: SheetEditorLayout;
  /** `remember: false` while dragging: only the end of the drag is written. */
  setCodeShare: (share: number, remember?: boolean) => void;
  /** Writes the layout as it is now (the end of a drag). */
  /** `remember: false` while dragging, as `setCodeShare`. */
  setConsoleHeight: (height: number, remember?: boolean) => void;
  remember: () => void;
  toggleConsole: () => void;
}>;

/** The template editor's layout, read once from `memory` (the default without one) and written
 *  back on each change.
 *
 *  Example: `const { layout, setCodeShare } = useSheetEditorLayout(deps.sheetEditorLayout)` */
export function useSheetEditorLayout(
  memory: SheetEditorLayoutMemory | undefined,
): SheetEditorLayoutModel {
  const [layout, setLayout] = useState(() => memory?.read() ?? DEFAULT_SHEET_EDITOR_LAYOUT);
  const change = useCallback(
    (update: (current: SheetEditorLayout) => SheetEditorLayout, remember: boolean) =>
      setLayout((current) => {
        const next = update(current);
        if (remember) memory?.write(next);
        return next;
      }),
    [memory],
  );
  const setCodeShare = useCallback(
    (share: number, remember = true) =>
      change((current) => ({ ...current, codeShare: clampCodeShare(share) }), remember),
    [change],
  );
  const setConsoleHeight = useCallback(
    (height: number, remember = true) =>
      change((current) => ({ ...current, consoleHeight: clampConsoleHeight(height) }), remember),
    [change],
  );
  const remember = useCallback(() => change((current) => current, true), [change]);
  const toggleConsole = useCallback(
    () => change((current) => ({ ...current, consoleOpen: !current.consoleOpen }), true),
    [change],
  );
  return { layout, setCodeShare, setConsoleHeight, remember, toggleConsole };
}
