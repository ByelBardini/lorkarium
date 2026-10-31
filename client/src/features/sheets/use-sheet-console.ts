import { useCallback, useMemo, useState } from 'react';
import {
  appendConsoleEntry,
  EMPTY_SHEET_CONSOLE,
  type SheetConsoleEntry,
  type SheetConsoleLog,
} from '@/sheet-sandbox/sheet-console';

export type SheetConsoleModel = Readonly<{
  log: SheetConsoleLog;
  append: (entry: Omit<SheetConsoleEntry, 'id'>) => void;
  clear: () => void;
}>;

/** The console lines of one sheet frame, kept while the editor (or the room's panel) is open.
 *
 *  Example: `const console = useSheetConsole(); host = createSheetPreviewHost(port, { onConsole })` */
export function useSheetConsole(): SheetConsoleModel {
  const [log, setLog] = useState<SheetConsoleLog>(EMPTY_SHEET_CONSOLE);
  const append = useCallback(
    (entry: Omit<SheetConsoleEntry, 'id'>) =>
      setLog((current) => appendConsoleEntry(current, entry)),
    [],
  );
  // The numbering goes on, so a list keyed by id never reuses a key after "Limpar".
  const clear = useCallback(
    () => setLog((current) => ({ ...EMPTY_SHEET_CONSOLE, nextId: current.nextId })),
    [],
  );
  return useMemo(() => ({ log, append, clear }), [log, append, clear]);
}
