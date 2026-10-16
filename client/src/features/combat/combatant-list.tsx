import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { CombatantRow } from './combatant-row';
import { StartCombatDialog } from './start-combat-dialog';

export type CombatantListProps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** The tracker: the combatants in the server's order, as a list with rules (no cards), and
 *  "+ Adicionar ao combate" (master) with the tokens still out of it.
 *
 *  Example: `<CombatantList board={board} interaction={interaction} isMaster onEditToken={edit} />` */
export function CombatantList(props: CombatantListProps): React.JSX.Element | null {
  const state = useBoard(props.board, (current) => current.board);
  const selected = useBoardInteraction(props.interaction, (current) => current.selectedTokenId);
  const combat = state?.combat;
  if (!state || !combat) return null;
  const rows = combat.combatants.flatMap((combatant, index) => {
    const token = state.tokens.find(({ id }) => id === combatant.tokenId);
    if (!token) return [];
    const tied = (offset: number): boolean =>
      combat.combatants[index + offset]?.initiative === combatant.initiative;
    return [{ combatant, token, tiedAbove: tied(-1), tiedBelow: tied(1) }];
  });
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Ordem de iniciativa" className="flex flex-col">
        {rows.map((row) => (
          <CombatantRow
            key={row.combatant.id}
            {...row}
            board={props.board}
            current={row.combatant.id === combat.currentCombatantId}
            open={row.token.id === selected}
            interaction={props.interaction}
            isMaster={props.isMaster}
            onEditToken={props.onEditToken}
          />
        ))}
      </ol>
      {props.isMaster && <AddCombatants state={state} interaction={props.interaction} />}
    </div>
  );
}

function AddCombatants({
  state,
  interaction,
}: Readonly<{ state: BoardStateDto; interaction: StoreApi<BoardInteractionStore> }>) {
  const [choosing, setChoosing] = useState(false);
  const readOnly = useBoardInteraction(interaction, (current) => current.readOnly);
  const outside: TokenDto[] = state.tokens.filter(
    (token) => !state.combat?.combatants.some(({ tokenId }) => tokenId === token.id),
  );
  const add = (tokenIds: string[]): void => {
    setChoosing(false);
    void interaction.getState().command((c, id) => c.addCombatants(id, tokenIds));
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={readOnly || outside.length === 0}
        onClick={() => setChoosing(true)}
      >
        <PlusIcon aria-hidden="true" />
        Adicionar ao combate
      </Button>
      {choosing && (
        <StartCombatDialog
          tokens={outside}
          title="Adicionar ao combate"
          confirmLabel="Adicionar"
          onConfirm={add}
          onClose={() => setChoosing(false)}
        />
      )}
    </>
  );
}
