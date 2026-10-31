import type { MemberCardDto } from '@lorkarium/contracts';
import { HexagonIcon, ShieldIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { characterAnchorOf } from '@/lib/character-anchor';
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
  /** Whether the viewer is a master: the master edits every card. */
  isMaster: boolean;
  clock: InteractionClock;
  /** The server time of the last presence update ("há N min" counts from it). */
  serverAt: string | null;
}>;

/** A player on the "Na mesa" tab: the main token's portrait and bars, the character name, the
 *  nick with the presence symbol, CA, CD and two free lines; the member and the masters edit it,
 *  and the "⋯" moves the player to the roles the viewer may give (`player.assignable`).
 *  Before the board arrives, only the nick line (cards and tokens come with the `board:sync`).
 *
 *  Example: `<PlayerCard player={roster.players[0]} board={board} interaction={interaction} isMaster={false} />` */
export function PlayerCard(props: PlayerCardProps): React.JSX.Element {
  const { member, isViewer, card } = props.player;
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
      {card ? (
        <CardBody {...props} card={card} titleId={titleId} awayLabel={awayLabel} />
      ) : (
        <NickLine id={titleId} member={member} isViewer={isViewer} awayLabel={awayLabel} withMark />
      )}
    </article>
  );
}

type CardBodyProps = PlayerCardProps &
  Readonly<{ card: MemberCardDto; titleId: string; awayLabel: string | null }>;

function useCardEditing({ player, interaction, isMaster }: PlayerCardProps): CardEditing {
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const hintId = useId();
  const { userId } = player.member;
  return {
    editable: player.isViewer || isMaster,
    disabled: readOnly,
    hintId,
    send: (changes) =>
      interaction
        .getState()
        .command((commands, scope) => commands.updateMemberCard(scope, userId, changes)),
  };
}

function CardBody(props: CardBodyProps): React.JSX.Element {
  const { player, card, titleId } = props;
  const { member, isViewer, token } = player;
  const editing = useCardEditing(props);
  const roleChange = useRoleChange(props);
  const name = player.characterName ?? member.name;
  return (
    <>
      <span id={editing.hintId} className="sr-only">
        {SAVE_HINT}
      </span>
      <div className="flex gap-3">
        <CardPortrait token={token} member={member} name={name} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <CharacterName
            titleId={titleId}
            shown={player.characterName ?? 'Sem personagem'}
            nickname={card.characterName}
            tokenName={token?.name ?? ''}
            editing={editing}
          />
          <NickLine member={member} isViewer={isViewer} awayLabel={props.awayLabel} />
          <CardBars token={token} name={name} board={props.board} interaction={props.interaction} />
        </div>
      </div>
      <CardStats
        {...props}
        name={name}
        editing={editing}
        actions={
          <>
            <CharacterSheetButton
              memberId={member.userId}
              anchorTokenId={characterAnchorOf(card, token)}
              name={name}
              isMaster={props.isMaster}
            />
            {roleMenuOf(roleChange, player.assignable, member.name)}
          </>
        }
      />
      <div className="flex flex-col gap-0.5">
        <NoteField
          label={`Anotação 1 de ${name}`}
          field="noteOne"
          value={card.noteOne}
          placeholder="Linha livre"
          editing={editing}
        />
        <NoteField
          label={`Anotação 2 de ${name}`}
          field="noteTwo"
          value={card.noteTwo}
          placeholder="Linha livre"
          editing={editing}
        />
      </div>
      {roleChange && <RoleChangeFeedback flow={roleChange} name={member.name} />}
    </>
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

type CardStatsProps = CardBodyProps &
  Readonly<{ name: string; editing: CardEditing; actions: ReactNode }>;

function CardStats(props: CardStatsProps) {
  const { card, name, editing } = props;
  const { token } = props.player;
  return (
    <div className="flex items-center gap-2">
      <StatField
        icon={ShieldIcon}
        short="CA"
        title="Classe de Armadura"
        field="armorClass"
        value={card.armorClass}
        owner={name}
        editing={editing}
      />
      <StatField
        icon={HexagonIcon}
        short="CD"
        title="Classe de Dificuldade"
        field="difficultyClass"
        value={card.difficultyClass}
        owner={name}
        editing={editing}
      />
      <span className="flex-1" />
      {token && (
        <LocateButton
          token={token}
          name={name}
          board={props.board}
          interaction={props.interaction}
        />
      )}
      {props.actions}
    </div>
  );
}
