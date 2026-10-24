import type { MemberCardDto } from '@lorkarium/contracts';
import { HexagonIcon, ShieldIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { RosterPlayer } from '@/lib/table-roster';
import { cn } from '@/lib/utils';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useMemberRoleChange, type MemberRoleChange } from './use-member-role-change';
import { MoveToSpectatorsConfirm } from './move-to-spectators-confirm';
import { PlayerActionsMenu } from './player-actions-menu';
import {
  CharacterName,
  NoteField,
  SAVE_HINT,
  StatField,
  type CardEditing,
} from './player-card-fields';
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
 *  and the master moves the player to the spectators from its "⋯".
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
        'group flex flex-col gap-3 border-b border-divider py-3 last:border-b-0',
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
  const demotion = useDemotion(props);
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
        actions={demotionMenuOf(demotion, member.name)}
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
      {demotion && <DemotionPrompt demotion={demotion} name={member.name} />}
    </>
  );
}

type Demotion = Readonly<{
  move: MemberRoleChange;
  asking: boolean;
  setAsking: (asking: boolean) => void;
}>;

// Only the master moves a player to the spectators; outside the room (no changer) there is no "⋯".
function useDemotion({ player, isMaster, board }: PlayerCardProps): Demotion | null {
  const campaignId = useBoard(board, (state) => state.campaignId);
  const move = useMemberRoleChange(campaignId, player.member.userId);
  const [asking, setAsking] = useState(false);
  if (!move || !isMaster || player.isViewer) return null;
  return { move, asking, setAsking };
}

function demotionMenuOf(demotion: Demotion | null, name: string): ReactNode {
  if (!demotion) return null;
  return (
    <PlayerActionsMenu
      name={name}
      disabled={demotion.move.pending}
      onMoveToSpectators={() => demotion.setAsking(true)}
    />
  );
}

function DemotionPrompt({ demotion, name }: Readonly<{ demotion: Demotion; name: string }>) {
  const { move, asking, setAsking } = demotion;
  const confirm = (): void => {
    setAsking(false);
    move.change('spectator');
  };
  return (
    <>
      {asking && (
        <MoveToSpectatorsConfirm
          name={name}
          disabled={move.pending}
          onConfirm={confirm}
          onCancel={() => setAsking(false)}
        />
      )}
      {move.failure && (
        <p role="alert" className="text-xs text-destructive-text">
          {move.failure}
        </p>
      )}
    </>
  );
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
