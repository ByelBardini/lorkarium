import { useEffect, useState } from 'react';
import { TemplateLeaveDialog } from './template-leave-dialog';

/** Registers the question asked before leaving the editor (closing the library, picking another
 *  item): `true` lets it go. */
export type RegisterLeave = (guard: (() => Promise<boolean>) | null) => void;

/** Asks before the master leaves a template with unsaved code; nothing asked when it is saved.
 *  Returns the confirmation to render.
 *
 *  Example: `const leaveDialog = useTemplateLeaveGuard(model.dirty, props.onRegisterLeave)` */
export function useTemplateLeaveGuard(
  dirty: boolean,
  onRegisterLeave: RegisterLeave | undefined,
): React.JSX.Element | null {
  const [answer, setAnswer] = useState<((leave: boolean) => void) | null>(null);
  useEffect(() => {
    // Saved code registers no question: leaving stays immediate.
    if (!dirty) return;
    onRegisterLeave?.(() => new Promise((resolve) => setAnswer(() => resolve)));
    return () => onRegisterLeave?.(null);
  }, [dirty, onRegisterLeave]);
  if (!answer) return null;
  const settle = (leave: boolean): void => {
    setAnswer(null);
    answer(leave);
  };
  return <TemplateLeaveDialog onSettle={settle} />;
}
