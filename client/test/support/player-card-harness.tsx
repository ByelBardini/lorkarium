import type {
  BoardStateDto,
  CharacterDto,
  SessionMemberDto,
  TokenBarDto,
} from '@lorkarium/contracts';
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
import { linkedLyra, lyraCharacter } from './character-fixtures';
import { InteractionClockFake } from './interaction-clock-fake';
import { TableBoardCommandsFake } from './table-board-commands-fake';
import { BIA_AT_TABLE, vharnBoard, VHARN_GRID } from './table-session-fixtures';

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
    temp: 0,
    color: 'ember',
    visibility: 'everyone',
    display: 'number',
    ...overrides,
  };
}

export type CardScene = Readonly<{
  /** The group grid over `vharnBoard()`, Lyra's linked token in it unless told otherwise. */
  state?: Partial<BoardStateDto>;
  /** The member's character over `lyraCharacter()` (the PV `cardBar()`, nothing written, its
   *  `canControl` the member or a master); `null` = the characters still loading. */
  character?: Partial<CharacterDto> | null;
  member?: SessionMemberDto;
  viewerId?: string;
  isMaster?: boolean;
  /** The server time of the last presence update (what "há N min" counts from). */
  serverAt?: string | null;
}>;

/** One PlayerCard over real board and interaction stores, the commands played by the fake.
 *  `confirm(character)` puts a new confirmed character (an event arriving) under the same card,
 *  and `confirmMember(member)` a new presence of the member; `clock` plays the browser's time.
 *
 *  Example: `const card = new PlayerCardHarness(); card.render({ member: caio })` */
export class PlayerCardHarness {
  readonly commands = new TableBoardCommandsFake();
  readonly clock = new InteractionClockFake();
  readonly board: StoreApi<BoardStore> = createBoardStore(VHARN.id, () => undefined);
  readonly interaction: StoreApi<BoardInteractionStore> = createBoardInteractionStore({
    scopeOf: () => VHARN_GRID,
    commands: this.commands,
    describeRefusal: String,
  });
  private rerenderWith: ((ui: React.JSX.Element) => void) | null = null;
  private scene: CardScene = {};

  render(scene: CardScene = {}): void {
    this.scene = scene;
    this.rerenderWith = render(this.cardFor()).rerender;
  }

  /** The character as a later event left it, under the same card (its fields keep their focus). */
  confirm(character: Partial<CharacterDto>): void {
    this.scene = { ...this.scene, character: { ...this.scene.character, ...character } };
    this.rerenderWith?.(this.cardFor());
  }

  /** The member as a later presence update left them, under the same card. */
  confirmMember(member: SessionMemberDto, serverAt: string | null = null): void {
    this.scene = { ...this.scene, member, serverAt };
    this.rerenderWith?.(this.cardFor());
  }

  private cardFor(): React.JSX.Element {
    const { member = BIA_ONLINE, viewerId = BIA_AT_TABLE.userId, isMaster = false } = this.scene;
    const viewer = { userId: viewerId, role: isMaster ? ('master' as const) : ('player' as const) };
    const confirmed = vharnBoard({ viewer, tokens: [linkedLyra()], ...this.scene.state });
    this.board.getState().apply({ kind: 'board', state: confirmed });
    const { ownerId } = VHARN;
    const characters = this.charactersFor(member, viewerId, isMaster);
    const roster = tableRosterOf({
      members: [member],
      board: confirmed,
      characters,
      viewerId,
      ownerId,
    });
    const [player] = roster.players;
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

  private charactersFor(
    member: SessionMemberDto,
    viewerId: string,
    isMaster: boolean,
  ): CharacterDto[] | null {
    const { character } = this.scene;
    if (character === null) return null;
    const canControl = isMaster || viewerId === member.userId;
    const base = { userId: member.userId, bars: [cardBar()], armorClass: null, canControl };
    return [lyraCharacter({ ...base, ...character })];
  }
}
