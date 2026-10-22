import type { BoardStateDto, SessionMemberDto, TokenBarDto } from '@lorkarium/contracts';
import { render } from '@testing-library/react';
import type { StoreApi } from 'zustand/vanilla';
import { PlayerCard } from '@/features/sessions/player-card';
import { tableRosterOf } from '@/lib/table-roster';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from './campaigns-api-fake';
import { InteractionClockFake } from './interaction-clock-fake';
import { TableBoardCommandsFake } from './table-board-commands-fake';
import { BIA_AT_TABLE, lyra, vharnBoard } from './table-session-fixtures';

export const BIA_ONLINE: SessionMemberDto = { ...BIA_AT_TABLE, online: true };

/** A bar of the card, PV 21 / 28 for everyone unless overridden.
 *
 *  Example: `cardBar({ label: 'Mana', current: 9, max: 16 })` */
export function cardBar(overrides: Partial<TokenBarDto> = {}): TokenBarDto {
  return {
    id: crypto.randomUUID(),
    position: 0,
    label: 'PV',
    current: 21,
    max: 28,
    color: 'ember',
    visibility: 'everyone',
    display: 'number',
    ...overrides,
  };
}

export type CardScene = Readonly<{
  state?: Partial<BoardStateDto>;
  member?: SessionMemberDto;
  viewerId?: string;
  isMaster?: boolean;
  /** The server time of the last presence update (what "há N min" counts from). */
  serverAt?: string | null;
}>;

/** One PlayerCard over real board and interaction stores, the commands played by the fake.
 *  `confirm(state)` puts a new confirmed board (an event arriving) under the same card, and
 *  `confirmMember(member)` a new presence of the member; `clock` plays the browser's time.
 *
 *  Example: `const card = new PlayerCardHarness(); card.render({ member: caio })` */
export class PlayerCardHarness {
  readonly commands = new TableBoardCommandsFake();
  readonly clock = new InteractionClockFake();
  readonly board: StoreApi<BoardStore> = createBoardStore(VHARN.id, () => undefined);
  readonly interaction: StoreApi<BoardInteractionStore> = createBoardInteractionStore({
    campaignId: VHARN.id,
    commands: this.commands,
    describeRefusal: String,
  });
  private rerenderWith: ((ui: React.JSX.Element) => void) | null = null;
  private scene: CardScene = {};
  private state: Partial<BoardStateDto> = {};

  render(scene: CardScene = {}): void {
    this.scene = scene;
    this.state = scene.state ?? {};
    this.rerenderWith = render(this.cardFor(this.state)).rerender;
  }

  /** The board as a later event left it, under the same card (its fields keep their focus). */
  confirm(state: Partial<BoardStateDto>): void {
    this.state = state;
    this.rerenderWith?.(this.cardFor(state));
  }

  /** The member as a later presence update left them, under the same card. */
  confirmMember(member: SessionMemberDto, serverAt: string | null = null): void {
    this.scene = { ...this.scene, member, serverAt };
    this.rerenderWith?.(this.cardFor(this.state));
  }

  private cardFor(state: Partial<BoardStateDto>): React.JSX.Element {
    const { member = BIA_ONLINE, viewerId = BIA_AT_TABLE.userId, isMaster = false } = this.scene;
    const viewer = { userId: viewerId, role: isMaster ? ('master' as const) : ('player' as const) };
    const confirmed = vharnBoard({ viewer, tokens: [lyra({ bars: [cardBar()] })], ...state });
    this.board.getState().apply({ kind: 'board', state: confirmed });
    const [player] = tableRosterOf({ members: [member], board: confirmed, viewerId }).players;
    if (!player) throw new Error(`no player card for ${member.name}`);
    return (
      <PlayerCard
        player={player}
        board={this.board}
        interaction={this.interaction}
        isMaster={isMaster}
        clock={this.clock}
        serverAt={this.scene.serverAt ?? null}
      />
    );
  }
}
