import { cell, type Cell } from '@lorkarium/game-core';
import { act } from '@testing-library/react';
import type { BoardView } from '@/renderer/board-view';
import type {
  BoardIntent,
  BoardIntentListener,
  BoardRenderer,
  CreateBoardRenderer,
  PingMark,
} from '@/renderer/board-renderer';

type MountMode = 'resolve' | 'hold' | 'reject';

/** A renderer the test watches: `draws` keeps every view, `zooms` every zoomBy factor, `fits`
 *  counts fitScene; `emit(intent)` plays the canvas (inside `act`).
 *
 *  Example: `deps.boardRenderers.latest().emit({ kind: 'cameraChanged', zoom: 1.25 })` */
export class BoardRendererFake implements BoardRenderer {
  readonly draws: BoardView[] = [];
  readonly zooms: number[] = [];
  fits = 0;
  /** What `viewCenterCell()` answers. */
  centerCell: Cell | null = cell(0, 0);
  mounted = false;
  destroyed = false;
  private releaseMount: (() => void) | null = null;

  constructor(
    private readonly onIntent: BoardIntentListener,
    private readonly mode: MountMode,
  ) {}

  mount(): Promise<void> {
    if (this.mode === 'reject') return Promise.reject(new Error('WebGL unavailable'));
    if (this.mode === 'resolve') return this.markMounted();
    return new Promise((resolve) => {
      this.releaseMount = () => void this.markMounted().then(resolve);
    });
  }

  /** Lets a held `mount` finish, as a slow `Application.init` would. */
  async finishMount(): Promise<void> {
    await act(async () => {
      this.releaseMount?.();
      await Promise.resolve();
    });
  }

  draw(view: BoardView): void {
    this.draws.push(view);
  }

  zoomBy(factor: number): void {
    this.zooms.push(factor);
  }

  fitScene(): void {
    this.fits += 1;
  }

  viewCenterCell(): Cell | null {
    return this.centerCell;
  }

  /** Each cell `centerOn` was asked to bring into view. */
  readonly centered: Cell[] = [];

  centerOn(target: Cell): void {
    this.centered.push(target);
  }

  /** Each ping the board was asked to show, in order. */
  readonly pings: PingMark[] = [];

  showPing(ping: PingMark): void {
    this.pings.push(ping);
  }

  destroy(): void {
    this.destroyed = true;
  }

  emit(intent: BoardIntent): void {
    act(() => this.onIntent(intent));
  }

  get lastView(): BoardView | undefined {
    return this.draws.at(-1);
  }

  private async markMounted(): Promise<void> {
    this.mounted = true;
  }
}

/** The `createBoardRenderer` of the tests: keeps every renderer it made, in order.
 *
 *  Example: `const renderers = new BoardRenderersFake(); deps.createBoardRenderer = renderers.create` */
export class BoardRenderersFake {
  readonly made: BoardRendererFake[] = [];
  mountMode: MountMode = 'resolve';

  readonly create: CreateBoardRenderer = (onIntent) => {
    const renderer = new BoardRendererFake(onIntent, this.mountMode);
    this.made.push(renderer);
    return renderer;
  };

  get alive(): BoardRendererFake[] {
    return this.made.filter((renderer) => !renderer.destroyed);
  }

  latest(): BoardRendererFake {
    const renderer = this.made.at(-1);
    if (!renderer) throw new Error('no board renderer was created yet');
    return renderer;
  }
}
