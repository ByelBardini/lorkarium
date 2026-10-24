import { useId } from 'react';
import { Button } from '@/components/ui/button';

export const MOVE_TO_SPECTATORS_DETAIL =
  'Tokens, ficha e personagem ficam guardados e voltam numa nova promoção.';

export type MoveToSpectatorsConfirmProps = Readonly<{
  /** The account name of the player. */
  name: string;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}>;

/** "Mover Bia para espectadores?" in place, under the card: the player stops playing at once, so
 *  it is asked, with what stays (tokens, card, character) until a new promotion. Esc cancels.
 *
 *  Example: `{asking && <MoveToSpectatorsConfirm name="Bia" disabled={false} onConfirm={move} onCancel={close} />}` */
export function MoveToSpectatorsConfirm({
  name,
  disabled,
  onConfirm,
  onCancel,
}: MoveToSpectatorsConfirmProps): React.JSX.Element {
  const id = useId();
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-detail`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      className="flex flex-col gap-2.5 rounded-md border border-destructive/50 bg-destructive/10 p-3"
    >
      <span id={`${id}-title`} className="text-[15px] font-semibold">
        {`Mover ${name} para espectadores?`}
      </span>
      <span id={`${id}-detail`} className="text-[13px] text-label">
        {MOVE_TO_SPECTATORS_DETAIL}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          className="flex-1"
          disabled={disabled}
          onClick={onConfirm}
        >
          Mover
        </Button>
        <Button type="button" variant="outline" className="flex-1" autoFocus onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
