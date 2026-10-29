import { useCallback, useState, type RefObject } from 'react';
import type { ChatWindowHandle } from '@/services/chat-window-host';

export type ChatWindowTopmost = Readonly<{
  alwaysOnTop: boolean;
  changingAlwaysOnTop: boolean;
  alwaysOnTopProblem: string | null;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
}>;

type TopmostState = Readonly<{ enabled: boolean; busy: boolean; problem: string | null }>;
const OFF: TopmostState = { enabled: false, busy: false, problem: null };
const FAILED = 'Não foi possível alterar “Sempre por cima”. Tente novamente.';
type TopmostControls = ChatWindowTopmost & Readonly<{ resetAlwaysOnTop: () => void }>;

/** Keeps the native checkbox confirmed by its own popup, including refusals.
 * Example: `const topmost = useChatWindowTopmost(handleRef)` */
export function useChatWindowTopmost(
  handleRef: RefObject<ChatWindowHandle | null>,
): TopmostControls {
  const [state, setState] = useState<TopmostState>(OFF);
  const setAlwaysOnTop = useCallback(
    async (enabled: boolean): Promise<void> => {
      const handle = handleRef.current;
      if (!handle?.setAlwaysOnTop || handle.closed) return;
      setState((previous) => ({ ...previous, busy: true, problem: null }));
      const outcome = await applyTopmost(handle, enabled);
      if (handleRef.current !== handle || handle.closed) return;
      setState((previous) =>
        outcome === 'failed'
          ? { ...previous, busy: false, problem: FAILED }
          : { enabled, busy: false, problem: null },
      );
    },
    [handleRef],
  );
  const resetAlwaysOnTop = useCallback(() => setState(OFF), []);
  return {
    alwaysOnTop: state.enabled,
    changingAlwaysOnTop: state.busy,
    alwaysOnTopProblem: state.problem,
    setAlwaysOnTop,
    resetAlwaysOnTop,
  };
}

async function applyTopmost(
  handle: ChatWindowHandle,
  enabled: boolean,
): Promise<'applied' | 'failed'> {
  try {
    await handle.setAlwaysOnTop?.(enabled);
    return 'applied';
  } catch {
    return 'failed';
  }
}
