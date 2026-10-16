import { sameCell, type Cell } from '@lorkarium/game-core';
import type { StoreApi } from 'zustand/vanilla';
import { browserClock, type InteractionClock } from '@/lib/interaction-clock';
import { ROUTE_BEND_DWELL_MS, settleRoute, startRoute, stepRoute } from '@/lib/token-route';
import type { BoardCommandResult } from '@/services/table-board-commands';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';
import { TokenDragRelay } from './token-drag-relay';

type MoveRequest = Readonly<{ tokenId: string; to: Cell; announce: string | undefined }>;
type DropRequest = Omit<MoveRequest, 'to'> & Readonly<{ to: Cell | null }>;
type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;
type RefusalSink = (result: BoardCommandResult) => void;

/** The move of one token by this viewer: the route and its bend timer while dragging, the
 *  previews the table sees, and the move command that ends it. One per interaction store.
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
    const send = (tokenId: string, over: Cell | null) =>
      deps.commands.dragToken(deps.campaignId, tokenId, over);
    this.relay = new TokenDragRelay(send, this.clock);
  }

  over(tokenId: string, origin: Cell, over: Cell | null): void {
    const { getState, setState } = this.store;
    if (getState().readOnly) return;
    const drag = getState().drag;
    const now = this.clock.now();
    const started = drag?.tokenId === tokenId ? drag.route : startRoute(origin, now);
    if (!over) return setState({ drag: { tokenId, route: started } });
    setState({ drag: { tokenId, route: stepRoute(started, over, now) } });
    this.waitForBend();
    this.relay.push(tokenId, over);
  }

  cancel(): void {
    const drag = this.store.getState().drag;
    if (!drag) return;
    this.forget();
    this.relay.end(drag.tokenId);
  }

  /** Drops the drag without telling the table (reconnecting: there is no one to tell). */
  forget(): void {
    this.cancelBend?.();
    this.cancelBend = null;
    this.store.setState({ drag: null });
  }

  async drop({ tokenId, to, announce }: DropRequest): Promise<void> {
    const origin = this.store.getState().drag?.route.origin;
    if (!to || (origin && sameCell(to, origin))) return this.cancel();
    this.forget();
    await this.move({ tokenId, to, announce });
  }

  // The ghost shows at once; the command waits for the drag previews still on their way.
  async move({ tokenId, to, announce }: MoveRequest): Promise<void> {
    const { getState, setState } = this.store;
    if (getState().readOnly) return;
    const preview = { tokenId, col: to.col, row: to.row };
    setState({ preview });
    const onItsWay = this.relay.settle();
    if (onItsWay) await onItsWay;
    const result = await this.deps.commands.moveToken(this.deps.campaignId, tokenId, to);
    // The confirmed token:moved arrives before its ack, so the board already shows the new cell.
    if (getState().preview === preview) setState({ preview: null });
    if (result.ok && announce) setState({ notice: announce });
    this.onAnswer(result);
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
