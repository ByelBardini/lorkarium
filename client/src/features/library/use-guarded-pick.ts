import { useCallback, useRef } from 'react';

type LeaveGuard = () => Promise<boolean>;
type RegisterLeave = (guard: LeaveGuard | null) => void;

export type GuardedPick = Readonly<{
  /** Picks `key`, after the open panel agreed to be left (a template with unsaved code asks). */
  pick: (key: string | null) => void;
  /** What a panel registers its question with; forwarded to the dialog's own guard (closing). */
  registerLeave: RegisterLeave;
}>;

/** Picking another item of the tree asks the open panel first; with no question registered the
 *  pick is immediate.
 *
 *  Example: `const { pick, registerLeave } = useGuardedPick(view.pickedKey, view.pick, props.onRegisterLeave)` */
export function useGuardedPick(
  pickedKey: string | null,
  pick: (key: string | null) => void,
  forward: RegisterLeave | undefined,
): GuardedPick {
  const guard = useRef<LeaveGuard | null>(null);
  const registerLeave = useCallback(
    (next: LeaveGuard | null) => {
      guard.current = next;
      forward?.(next);
    },
    [forward],
  );
  const guardedPick = (key: string | null): void => {
    const ask = guard.current;
    if (!ask || key === pickedKey) return pick(key);
    void ask().then((leave) => leave && pick(key));
  };
  return { pick: guardedPick, registerLeave };
}
