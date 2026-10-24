import { blockedPassage, sameCell, tokenCenter, type Cell, type Wall } from '@lorkarium/game-core';
import type { StoreApi } from 'zustand/vanilla';
import type { TokenMove } from '@/lib/edit-history';
import { browserClock, type InteractionClock } from '@/lib/interaction-clock';
import { shiftGroup, type GroupPlacement } from '@/lib/token-group';
import {
  ROUTE_BEND_DWELL_MS,
  routeBends,
  settleRoute,
  startRoute,
  stepRoute,
  type RouteBlock,
} from '@/lib/token-route';
import type { GroupMember } from '@/lib/token-group';
import type { BoardCommandResult } from '@/services/table-board-commands';
import type {
  BoardInteractionDeps,
  BoardInteractionStore,
  DragGroup,
  TokenDrag,
  TokenPreview,
} from './board-interaction-store';
import { TokenDragRelay } from './token-drag-relay';

type MoveRequest = Readonly<{
  tokenId: string;
  to: Cell;
  announce: string | undefined;
  /** The bends around walls, between where it stands and `to`. */
  path?: readonly Cell[];
}>;
type DropRequest = Omit<MoveRequest, 'to'> & Readonly<{ to: Cell | null }>;
type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;
type RefusalSink = (result: BoardCommandResult) => void;
type SendMove = () => Promise<BoardCommandResult>;

/** The move of one token, or of a group anchored on the token picked up, by this viewer: the
 *  anchor's route and its bend timer while dragging, the previews the table sees, and the move
 *  command that ends it. One per interaction store.
 *
 *  Example: `const drags = new TokenDragFlow(deps, { getState: get, setState: set }, sayIfRefused)` */
export class TokenDragFlow {
  private readonly clock: InteractionClock;
  private readonly relay: TokenDragRelay;
  private cancelBend: (() => void) | null = null;

  constructor(
    private readonly deps: BoardInteractionDeps,
    private readonly store: StoreAccess,
    private readonly onAnswer: RefusalSink,
  ) {
    this.clock = deps.clock ?? browserClock;
    const send = (drags: Parameters<TokenDragRelay['push']>[0]) =>
      deps.commands.dragTokens(deps.scopeOf(), drags);
    this.relay = new TokenDragRelay(send, this.clock);
  }

  over(anchorId: string, origin: Cell, over: Cell | null, group: DragGroup): void {
    const { getState, setState } = this.store;
    if (getState().readOnly) return;
    const now = this.clock.now();
    const drag = this.dragOf(anchorId, origin, group, now);
    if (!over) return setState({ drag });
    const route = stepRoute(drag.route, over, now, anchorBlock(drag));
    const landing = shiftGroup(drag.scene, drag.members, drag.route.origin, route.current);
    setState({ drag: { ...drag, route, landing } });
    this.waitForBend();
    if (landing)
      this.relay.push(landing.map(({ tokenId, col, row }) => ({ tokenId, cell: { col, row } })));
  }

  cancel(): void {
    const drag = this.store.getState().drag;
    if (!drag) return;
    this.forget();
    this.relay.end(drag.members.map(({ tokenId }) => tokenId));
  }

  /** Drops the drag without telling the table (reconnecting: there is no one to tell). */
  forget(): void {
    this.cancelBend?.();
    this.cancelBend = null;
    this.store.setState({ drag: null });
  }

  // Off the scene, back home or with a member pushed off: the group goes back, nothing moves.
  // Released past a wall, the token stops on the cell before it (where the route stopped), and
  // the room says why; a group with a member that would cross one does not move at all.
  async drop({ tokenId, to, announce }: DropRequest): Promise<void> {
    const drag = this.store.getState().drag;
    if (!drag) return to ? this.move({ tokenId, to, announce }) : undefined;
    const dest = to && drag.walls ? drag.route.current : to;
    const stopped = Boolean(to && dest && !sameCell(to, dest));
    if (!dest || sameCell(dest, drag.route.origin)) return this.cancelAndSay(stopped);
    const landing = shiftGroup(drag.scene, drag.members, drag.route.origin, dest);
    if (!landing) return this.cancel();
    const bends = routeBends(drag.route);
    if (groupCrossesWall(drag, landing, bends)) return this.cancelAndSay(true);
    this.forget();
    if (drag.members.length === 1) await this.move({ tokenId, to: dest, announce, path: bends });
    else await this.moveGroup(withPaths(drag, landing, bends), announce);
    if (stopped) this.sayWall();
  }

  private cancelAndSay(wall: boolean): void {
    this.cancel();
    if (wall) this.sayWall();
  }

  private sayWall(): void {
    this.store.setState({ notice: this.deps.describeRefusal('wall_blocked') });
  }

  /** A group move in one command (a drop, the arrows), recorded as one undo entry. */
  async moveGroup(landing: readonly GroupPlacement[], announce: string | undefined): Promise<void> {
    const send = () => this.deps.commands.moveTokens(this.deps.scopeOf(), landing);
    await this.sendMove(landing, send, announce);
  }

  async move({ tokenId, to, announce, path = [] }: MoveRequest): Promise<void> {
    const bends = path.length > 0 ? { path } : {};
    const placed = [{ tokenId, col: to.col, row: to.row, ...bends }];
    const send = () => this.deps.commands.moveToken(this.deps.scopeOf(), tokenId, to, path);
    await this.sendMove(placed, send, announce);
  }

  // The ghosts show at once; the command waits for the drag previews still on their way.
  private async sendMove(
    landing: readonly GroupPlacement[],
    send: SendMove,
    announce: string | undefined,
  ): Promise<void> {
    const { getState, setState } = this.store;
    if (getState().readOnly) return;
    const preview: readonly TokenPreview[] = landing.map(({ tokenId, col, row }) => ({
      tokenId,
      col,
      row,
    }));
    setState({ preview });
    // Read before the command: its confirmed event lands before its ack.
    const moves = this.movesFrom(landing);
    const onItsWay = this.relay.settle();
    if (onItsWay) await onItsWay;
    const result = await send();
    // The confirmed move arrives before its ack, so the board already shows the new cells.
    if (getState().preview === preview) setState({ preview: [] });
    if (result.ok && announce) setState({ notice: announce });
    if (result.ok && moves.length > 0) this.deps.recordEdit?.([{ kind: 'tokensMoved', moves }]);
    this.onAnswer(result);
  }

  private movesFrom(landing: readonly GroupPlacement[]): TokenMove[] {
    return landing.flatMap(({ tokenId, col, row, path }) => {
      const from = this.deps.tokenCellOf?.(tokenId);
      if (!from || (from.col === col && from.row === row)) return [];
      const bends = path && path.length > 0 ? { path } : {};
      return [{ tokenId, from, to: { col, row }, ...bends }];
    });
  }

  private dragOf(anchorId: string, origin: Cell, group: DragGroup, nowMs: number): TokenDrag {
    const drag = this.store.getState().drag;
    if (drag?.anchorId === anchorId) return drag;
    const route = startRoute(origin, nowMs);
    const { members, scene, walls } = group;
    return { anchorId, members, scene, walls, route, landing: null };
  }

  private waitForBend(): void {
    this.cancelBend?.();
    this.cancelBend = this.clock.after(ROUTE_BEND_DWELL_MS, () => this.bend());
  }

  private bend(): void {
    this.cancelBend = null;
    const drag = this.store.getState().drag;
    if (!drag) return;
    const route = settleRoute(drag.route, this.clock.now());
    this.store.setState({ drag: { ...drag, route } });
  }
}

// The anchor's legs, center to center, against the walls of the drag (none: the master).
function anchorBlock(drag: TokenDrag): RouteBlock | undefined {
  const anchor = drag.members.find(({ tokenId }) => tokenId === drag.anchorId);
  return drag.walls && anchor ? legBlock(anchor, drag.walls) : undefined;
}

function legBlock(member: GroupMember, walls: readonly Wall[]): RouteBlock {
  const center = (at: Cell) => tokenCenter(at, member);
  return (from, to) => blockedPassage([center(from), center(to)], walls) !== null;
}

// Every member walks the anchor's bends shifted by where it stands next to it.
function memberPathOf(drag: TokenDrag, member: GroupMember, bends: readonly Cell[]): Cell[] {
  const dx = member.col - drag.route.origin.col;
  const dy = member.row - drag.route.origin.row;
  return bends.map(({ col, row }) => ({ col: col + dx, row: row + dy }));
}

function groupCrossesWall(
  drag: TokenDrag,
  landing: readonly GroupPlacement[],
  bends: readonly Cell[],
): boolean {
  const { walls } = drag;
  if (!walls) return false;
  return drag.members.some((member) => {
    const to = landing.find(({ tokenId }) => tokenId === member.tokenId);
    if (!to) return false;
    const cells = [member, ...memberPathOf(drag, member, bends), to];
    const centers = cells.map((at) => tokenCenter(at, member));
    return blockedPassage(centers, walls) !== null;
  });
}

function withPaths(
  drag: TokenDrag,
  landing: readonly GroupPlacement[],
  bends: readonly Cell[],
): GroupPlacement[] {
  if (bends.length === 0) return [...landing];
  return landing.map((placement) => {
    const member = drag.members.find(({ tokenId }) => tokenId === placement.tokenId);
    return member ? { ...placement, path: memberPathOf(drag, member, bends) } : placement;
  });
}
