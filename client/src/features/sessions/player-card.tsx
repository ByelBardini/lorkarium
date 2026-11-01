import type { CharacterDto } from '@lorkarium/contracts';
import { HexagonIcon, ShieldIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { RosterPlayer } from '@/lib/table-roster';
import { cn } from '@/lib/utils';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useRoleChangeFlow, type RoleChangeFlow } from './use-member-role-change';
import { RoleActionsMenu } from './role-actions-menu';
import { RoleChangeFeedback } from './role-change-confirm';
import {
  CharacterName,
  NoteField,
  SAVE_HINT,
  StatField,
  type CardEditing,
} from './player-card-fields';
import { CharacterSheetButton } from '@/features/sheets/character-sheet-button';
import { CardBars, CardPortrait, LocateButton, NickLine } from './player-card-parts';
import { useAwayLabel } from './use-away-label';

export type PlayerCardProps = Readonly<{
  player: RosterPlayer;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  /** Whether the viewer is a master: the masters may give and make sheets. */
  isMaster: boolean;
  clock: InteractionClock;
  /** The server time of the last presence update ("há N min" counts from it). */
  serverAt: string | null;
}>;

/** A player on the "Na mesa" tab: their character's portrait and bars, its name, the nick with
 *  the presence symbol, CA, CD, two free lines and its sheets; who controls the character (its
 *  player and the masters, `canControl`) edits it, and the "⋯" moves the player to the roles the
 *  viewer may give (`player.assignable`). Before the characters arrive, only the nick line.
 *
 *  Example: `<PlayerCard player={roster.players[0]} board={board} interaction={interaction} isMaster={false} />` */
export function PlayerCard(props: PlayerCardProps): React.JSX.Element {
  const { member, isViewer, character } = props.player;
  const titleId = useId();
  const awayLabel = useAwayLabel(member.awaySince, props.serverAt, props.clock);
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        // -mx-4/px-4: the divider spans the whole panel, edge to edge.
        'group -mx-4 flex flex-col gap-3 border-b border-divider px-4 py-3 last:border-b-0',
        !member.online && 'opacity-60',
      )}
    >
      {character ? (
        <CardBody {...props} character={character} titleId={titleId} awayLabel={awayLabel} />
      ) : (
        <NickLine id={titleId} member={member} isViewer={isViewer} awayLabel={awayLabel} withMark />
      )}
    </article>
  );
}

type CardBodyProps = PlayerCardProps &
  Readonly<{ character: CharacterDto; titleId: string; awayLabel: string | null }>;

function useCardEditing({ character, interaction }: CardBodyProps): CardEditing {
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const hintId = useId();
  const characterId = character.id;
  return {
    editable: character.canControl,
    disabled: readOnly,
    hintId,
    send: (changes) =>
      interaction
        .getState()
        .command((commands, scope) => commands.updateCharacter(scope, characterId, changes)),
  };
}

function CardBody(props: CardBodyProps): React.JSX.Element {
  const { player, character, titleId } = props;
  const { member, isViewer, token } = player;
  const editing = useCardEditing(props);
  const roleChange = useRoleChange(props);
  const { name } = character;
  return (
    <>
      <span id={editing.hintId} className="sr-only">
        {SAVE_HINT}
      </span>
      <div className="flex gap-3">
        <CardPortrait face={character} member={member} name={name} onGrid={token !== null} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <CharacterName titleId={titleId} shown={name} editing={editing} />
          <NickLine member={member} isViewer={isViewer} awayLabel={props.awayLabel} />
          <CardBars character={character} name={name} interaction={props.interaction} />
        </div>
      </div>
      <CardStats
        {...props}
        editing={editing}
        actions={
          <>
            <CardSheets {...props} />
            {roleMenuOf(roleChange, player.assignable, member.name)}
          </>
        }
      />
      <CardNotes character={character} editing={editing} />
      {roleChange && <RoleChangeFeedback flow={roleChange} name={member.name} />}
    </>
  );
}

function CardSheets({ character, interaction, isMaster }: CardBodyProps): React.JSX.Element {
  const makeMain = (sheetId: string): void => {
    void interaction
      .getState()
      .command((commands, scope) => commands.setMainSheet(scope, character.id, sheetId));
  };
  return (
    <CharacterSheetButton
      characterId={character.id}
      memberId={character.userId}
      mainSheetId={character.mainSheetId}
      name={character.name}
      isMaster={isMaster}
      canControl={character.canControl}
      onMakeMain={makeMain}
    />
  );
}

function CardNotes({
  character,
  editing,
}: Readonly<{ character: CharacterDto; editing: CardEditing }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <NoteField
        label={`Anotação 1 de ${character.name}`}
        field="noteOne"
        value={character.noteOne}
        placeholder="Linha livre"
        editing={editing}
      />
      <NoteField
        label={`Anotação 2 de ${character.name}`}
        field="noteTwo"
        value={character.noteTwo}
        placeholder="Linha livre"
        editing={editing}
      />
    </div>
  );
}

// Outside the room (no changer) there is no "⋯".
function useRoleChange({ player, board }: PlayerCardProps): RoleChangeFlow | null {
  const campaignId = useBoard(board, (state) => state.campaignId);
  return useRoleChangeFlow(campaignId, player.member.userId);
}

function roleMenuOf(
  flow: RoleChangeFlow | null,
  roles: RosterPlayer['assignable'],
  name: string,
): ReactNode {
  if (!flow) return null;
  return <RoleActionsMenu name={name} roles={roles} disabled={flow.pending} onPick={flow.pick} />;
}

type CardStatsProps = CardBodyProps & Readonly<{ editing: CardEditing; actions: ReactNode }>;

function CardStats(props: CardStatsProps) {
  const { character, editing } = props;
  const { token } = props.player;
  return (
    <div className="flex items-center gap-2">
      <StatField
        icon={ShieldIcon}
        short="CA"
        title="Classe de Armadura"
        field="armorClass"
        value={character.armorClass}
        owner={character.name}
        editing={editing}
      />
      <StatField
        icon={HexagonIcon}
        short="CD"
        title="Classe de Dificuldade"
        field="difficultyClass"
        value={character.difficultyClass}
        owner={character.name}
        editing={editing}
      />
      <span className="flex-1" />
      {token && (
        <LocateButton
          token={token}
          name={character.name}
          board={props.board}
          interaction={props.interaction}
        />
      )}
      {props.actions}
    </div>
  );
}
