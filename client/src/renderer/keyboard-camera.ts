import {
  cameraKeyAction,
  keyboardPan,
  panKeyOf,
  type CameraKeyPress,
  type PanKey,
} from './camera-input';

const KEY_ZOOM_STEP = 1.25;

/** What the keys may ask of the board. `cancel` is Esc: whether a gesture under way took it. */
export type KeyboardCameraMoves = Readonly<{
  cancel: () => boolean;
  zoomBy: (factor: number) => void;
  fitScene: () => void;
  panBy: (dx: number, dy: number) => void;
}>;

/** The camera keys of the focused board, without the DOM: W A S D held pan on each `tick`,
 *  + - 0 zoom and frame, Esc drops a gesture first. With Ctrl/⌘/Alt the key is the browser's.
 *
 *  Example: `const keys = new KeyboardCamera(moves); host.onkeydown = (event) => keys.down(event)` */
export class KeyboardCamera {
  private readonly held = new Set<PanKey>();

  constructor(private readonly moves: KeyboardCameraMoves) {}

  down(press: CameraKeyPress): void {
    if (press.key === 'Escape' && this.moves.cancel()) return;
    const modified = press.ctrlKey || press.metaKey || press.altKey;
    const panKey = modified ? null : panKeyOf(press.key);
    if (panKey) return void this.held.add(panKey);
    const action = cameraKeyAction(press);
    if (action === 'zoom-in') this.moves.zoomBy(KEY_ZOOM_STEP);
    if (action === 'zoom-out') this.moves.zoomBy(1 / KEY_ZOOM_STEP);
    if (action === 'fit') this.moves.fitScene();
  }

  up(press: Pick<CameraKeyPress, 'key'>): void {
    const panKey = panKeyOf(press.key);
    if (panKey) this.held.delete(panKey);
  }

  /** The host lost the focus: no key is held any more. */
  release(): void {
    this.held.clear();
  }

  /** Example: `app.ticker.add((ticker) => keys.tick(ticker.deltaMS))` */
  tick(elapsedMs: number): void {
    if (this.held.size === 0) return;
    const { dx, dy } = keyboardPan(this.held, elapsedMs);
    this.moves.panBy(dx, dy);
  }
}
