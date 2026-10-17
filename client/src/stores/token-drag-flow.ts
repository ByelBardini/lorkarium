import { sameCell, type Cell } from '@lorkarium/game-core';
import type { StoreApi } from 'zustand/vanilla';
import type { TokenMove } from '@/lib/edit-history';
import { browserClock, type InteractionClock } from '@/lib/interaction-clock';
import { shiftGroup, type GroupPlacement } from '@/lib/token-group';
import { ROUTE_BEND_DWELL_MS, settleRoute, startRoute, stepRoute } from '@/lib/token-route';
import type { BoardCommandResult } from '@/services/table-board-commands';
import type {
  BoardInteractionDeps,
  BoardInteractionStore,
  DragGroup,
  TokenDrag,
  TokenPreview,
} from './board-interaction-store';
import { TokenDragRelay } from './token-drag-relay';

type MoveRequest = Readonly<{ tokenId: string; to: Cell; announce: string | undefined }>;
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
      deps.commands.dragTokens(deps.campaignId, drags);
    this.relay = new TokenDragRelay(send, this.clock);
  }

  over(anchorId: string, origin: Cell, over: Cell | null, group: DragGroup): void {
    const { getState, setState } = this.store;
    if (getState().readOnly) return;
    const now = this.clock.now();
    const drag = this.dragOf(anchorId, origin, group, now);
    if (!over) return setState({ drag });
    const route = stepRoute(drag.route, over, now);
    const landing = shiftGroup(drag.scene, drag.members, drag.route.origin, over);
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
  async drop({ tokenId, to, announce }: DropRequest): Promise<void> {
    const drag = this.store.getState().drag;
    if (!drag) return to ? this.move({ tokenId, to, announce }) : undefined;
    if (!to || sameCell(to, drag.route.origin)) return this.cancel();
    const landing = shiftGroup(drag.scene, drag.members, drag.route.origin, to);
    if (!landing) return this.cancel();
    this.forget();
    if (drag.members.length === 1) return this.move({ tokenId, to, announce });
    await this.moveGroup(landing, announce);
  }

  /** A group move in one command (a drop, the arrows), recorded as one undo entry. */
  async moveGroup(landing: readonly GroupPlacement[], announce: string | undefined): Promise<void> {
    const send = () => this.deps.commands.moveTokens(this.deps.campaignId, landing);
    await this.sendMove(landing, send, announce);
  }

  async move({ tokenId, to, announce }: MoveRequest): Promise<void> {
    const preview = [{ tokenId, col: to.col, row: to.row }];
    const send = () => this.deps.commands.moveToken(this.deps.campaignId, tokenId, to);
    await this.sendMove(preview, send, announce);
  }

  // The ghosts show at once; the command waits for the drag previews still on their way.
  private async sendMove(
    landing: readonly GroupPlacement[],
    send: SendMove,
    announce: string | undefined,
  ): Promise<void> {
    const { getState, setState } = this.store;
    if (getState().readOnly) return;
    const preview: readonly TokenPreview[] = landing;
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
    return landing.flatMap(({ tokenId, col, row }) => {
      const from = this.deps.tokenCellOf?.(tokenId);
      if (!from || (from.col === col && from.row === row)) return [];
      return [{ tokenId, from, to: { col, row } }];
    });
  }

  private dragOf(anchorId: string, origin: Cell, group: DragGroup, nowMs: number): TokenDrag {
    const drag = this.store.getState().drag;
    if (drag?.anchorId === anchorId) return drag;
    const route = startRoute(origin, nowMs);
    return { anchorId, members: group.members, scene: group.scene, route, landing: null };
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
