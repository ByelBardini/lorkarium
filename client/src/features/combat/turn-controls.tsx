import type { CombatDto, TokenDto } from '@lorkarium/contracts';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nextTurnLabelOf, upNextTextOf } from '@/lib/combat-rows';

export type TurnControlsProps = Readonly<{
  combat: CombatDto;
  seenTokens: readonly TokenDto[];
  isMaster: boolean;
  /** A player who runs the entry on turn passes it. */
  canPass: boolean;
  readOnly: boolean;
  onNext: () => void;
  onPrevious: () => void;
}>;

/** The turn under the round: the master's "Turno anterior" (an icon) and "Próximo turno", which
 *  reads "Fechar rodada 2" on the last of the order; a player's "Passar a vez"; and, for everyone,
 *  who comes next.
 *
 *  Example: `<TurnControls combat={combat} seenTokens={seen} isMaster canPass={false} readOnly={false} onNext={next} onPrevious={back} />` */
export function TurnControls(props: TurnControlsProps): React.JSX.Element {
  const { combat, isMaster, canPass, readOnly } = props;
  const off = readOnly || combat.currentCombatantId === null;
  const upNext = upNextTextOf(combat, props.seenTokens);
  return (
    <div className="flex flex-col gap-1.5">
      {(isMaster || canPass) && (
        <div className="flex gap-2">
          {isMaster && (
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-11"
              aria-label="Turno anterior"
              title="Turno anterior"
              disabled={off}
              onClick={props.onPrevious}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            size="xl"
            className="h-11 flex-1"
            disabled={off}
            onClick={props.onNext}
          >
            {isMaster ? nextTurnLabelOf(combat) : 'Passar a vez'}
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      )}
      {upNext && <p className="text-xs text-muted-foreground">{upNext}</p>}
    </div>
  );
}
