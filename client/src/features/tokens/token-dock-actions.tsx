import type { TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useViewerTokenRights } from '@/features/board/table-token-rights';
import { InitiativeField } from '@/features/combat/initiative-field';
import { canRunEntry, entryOfToken } from '@/lib/combat-entries';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';

export type TokenDockActionsProps = Readonly<{
  token: TokenDto;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** The foot of the token's detail: in combat, the initiative of its entry (for whoever runs it)
 *  and the master's "Tirar do combate" (only this token); always, "Editar token" for whoever may
 *  edit it (the master, whoever controls its linked token, or its creator with the room's create key).
 *
 *  Example: `<TokenDockActions token={kael} board={board} interaction={interaction} isMaster onEditToken={edit} />` */
export function TokenDockActions(props: TokenDockActionsProps): React.JSX.Element | null {
  const { token, interaction, isMaster } = props;
  const state = useBoard(props.board, (current) => current.board);
  const readOnly = useBoardInteraction(interaction, (current) => current.readOnly);
  const entry = entryOfToken(state?.combat ?? null, token.id);
  const runs = entry !== null && canRunEntry(entry, state?.tokens ?? [], isMaster);
  const canEdit = useViewerTokenRights(props.board).of(token).edit;
  if (!runs && !isMaster && !canEdit) return null;
  const send = interaction.getState().command;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-3">
      {entry && runs && (
        <label className="flex items-center gap-2 text-[13px] text-label">
          Iniciativa
          <InitiativeField
            key={String(entry.initiative)}
            name={token.name}
            value={entry.initiative}
            current={false}
            disabled={readOnly}
            onCommit={(value) => send((c, id) => c.setInitiative(id, entry.id, value))}
          />
        </label>
      )}
      <span className="flex-1" />
      {isMaster && entry && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={readOnly}
          onClick={() => void send((c, id) => c.regroupTokens(id, [token.id], { kind: 'out' }))}
        >
          Tirar do combate
        </Button>
      )}
      {canEdit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => props.onEditToken(token.id)}
        >
          Editar token
        </Button>
      )}
    </div>
  );
}
