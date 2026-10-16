import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { END_COMBAT_QUESTION } from './combat-view';

export type EndCombatButtonProps = Readonly<{ disabled: boolean; onConfirm: () => void }>;

/** "Encerrar combate" (master), in two steps: the question replaces the button until answered.
 *  The conditions stay on the tokens.
 *
 *  Example: `<EndCombatButton disabled={readOnly} onConfirm={end} />` */
export function EndCombatButton({ disabled, onConfirm }: EndCombatButtonProps): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive-text"
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        Encerrar combate
      </Button>
    );
  }
  return (
    <div
      role="group"
      aria-label={END_COMBAT_QUESTION}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-sm text-destructive-text">{END_COMBAT_QUESTION}</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Encerrar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
        Continuar
      </Button>
    </div>
  );
}
