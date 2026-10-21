import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { END_COMBAT_DETAIL, END_COMBAT_QUESTION } from './combat-view';

export type EndCombatConfirmProps = Readonly<{
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}>;

/** "Encerrar o combate?" in place, under the round: ending has no way back, so it is asked, with
 *  what stays (PV, bars, conditions) and what goes (the order and the rounds).
 *
 *  Example: `{confirming && <EndCombatConfirm disabled={readOnly} onConfirm={end} onCancel={close} />}` */
export function EndCombatConfirm({ disabled, onConfirm, onCancel }: EndCombatConfirmProps) {
  const id = useId();
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-detail`}
      className="flex flex-col gap-2.5 rounded-md border border-destructive/50 bg-destructive/10 p-3"
    >
      <span id={`${id}-title`} className="text-[15px] font-semibold">
        {END_COMBAT_QUESTION}
      </span>
      <span id={`${id}-detail`} className="text-[13px] text-label">
        {END_COMBAT_DETAIL}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          className="flex-1"
          disabled={disabled}
          onClick={onConfirm}
        >
          Encerrar
        </Button>
        <Button type="button" variant="outline" className="flex-1" autoFocus onClick={onCancel}>
          Continuar lutando
        </Button>
      </div>
    </div>
  );
}
