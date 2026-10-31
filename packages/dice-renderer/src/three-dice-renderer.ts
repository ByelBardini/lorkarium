import type * as Three from 'three';
import type { DiceRenderer, DiceRendererRoll } from './dice-renderer';
import {
  diceSceneAt,
  isDiceThrowGone,
  playDiceThrow,
  type DiceSceneThrow,
  type PlayingDiceThrow,
} from './dice-playback';
import { DICE_OVERLAY_Z_INDEX, diceStageScaleOf } from './dice-stage';
import {
  ThreeDiceMeshes,
  type DiceLook,
  type DiceRollObjects,
  type ThreeModule,
} from './three-dice-meshes';

// High enough that a die bouncing at the spawn height (6 units) never crosses the camera.
const CAMERA_HEIGHT = 5000;
const MAX_PIXEL_RATIO = 2;

/** What the overlay uses of the browser window (`window` in the app, a fake in specs). */
export type DiceOverlayHost = Pick<
  Window,
  | 'document'
  | 'performance'
  | 'requestAnimationFrame'
  | 'cancelAnimationFrame'
  | 'innerWidth'
  | 'innerHeight'
  | 'devicePixelRatio'
>;

/** The part of `WebGLRenderer` the overlay drives. */
export type DiceGl = Pick<
  Three.WebGLRenderer,
  'setClearColor' | 'setPixelRatio' | 'setSize' | 'render' | 'dispose'
>;

export type DiceGlFactory = (canvas: HTMLCanvasElement, three: ThreeModule) => DiceGl;

const webGlOf: DiceGlFactory = (canvas, three) =>
  new three.WebGLRenderer({ canvas, alpha: true, antialias: true });

/** What the overlay needs from its page: the `look` of the dice, and the window and WebGL
 *  (`window` and a `WebGLRenderer` when left out). With a `container` (the landing's dice
 *  stage) the canvas covers that element and takes its size, instead of the whole window; `zoom`
 *  (1 when left out) draws the middle of the roller's box larger.
 *
 *  Example: `{ look: { colorHex, numberColorOf, textureUrlOf } }` */
export interface ThreeDiceRendererOptions {
  readonly look: DiceLook;
  readonly view?: DiceOverlayHost;
  readonly createGl?: DiceGlFactory;
  readonly container?: HTMLElement;
  readonly zoom?: number;
}

interface LiveDiceRoll {
  readonly played: PlayingDiceThrow;
  readonly objects: DiceRollObjects;
}

function overlayCanvasOf(ownerDocument: Document, contained: boolean): HTMLCanvasElement {
  const canvas = ownerDocument.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.diceOverlay = '';
  Object.assign(canvas.style, {
    position: contained ? 'absolute' : 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: String(DICE_OVERLAY_Z_INDEX),
    display: 'none',
  });
  return canvas;
}

function zoomOf(zoom: number | undefined): number {
  if (zoom === undefined) return 1;
  if (zoom > 0) return zoom;
  throw new RangeError(`The dice zoom must be a positive number, got ${zoom}`);
}

function sceneOf(three: ThreeModule): Three.Scene {
  const scene = new three.Scene();
  scene.add(new three.AmbientLight(0xffffff, 1.4));
  const sun = new three.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-0.4, 1, -0.6);
  scene.add(sun);
  return scene;
}

// Looking straight down: screen right is +x and screen up is −z, like the roller's window.
function cameraOf(three: ThreeModule): Three.OrthographicCamera {
  const camera = new three.OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_HEIGHT * 2);
  camera.position.set(0, CAMERA_HEIGHT, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  return camera;
}

/** The three.js adapter of `DiceRenderer`: one transparent canvas over the whole window that
 *  takes no pointer events, hidden and without a frame loop while no roll is alive.
 *
 *  Example: `new ThreeDiceRenderer(await import('three'), { look }).show(roll)` */
export class ThreeDiceRenderer implements DiceRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: DiceGl;
  private readonly scene: Three.Scene;
  private readonly camera: Three.OrthographicCamera;
  private readonly meshes: ThreeDiceMeshes;
  private readonly live = new Map<string, LiveDiceRoll>();
  private readonly shown = new Set<string>();
  private readonly view: DiceOverlayHost;
  private readonly container: HTMLElement | undefined;
  private readonly zoom: number;
  private frameId: number | null = null;
  private size = { width: 0, height: 0 };

  constructor(three: ThreeModule, options: ThreeDiceRendererOptions) {
    this.view = options.view ?? window;
    this.container = options.container;
    this.zoom = zoomOf(options.zoom);
    this.canvas = overlayCanvasOf(this.view.document, this.container !== undefined);
    (this.container ?? this.view.document.body).append(this.canvas);
    this.gl = (options.createGl ?? webGlOf)(this.canvas, three);
    this.gl.setClearColor(0x000000, 0);
    this.scene = sceneOf(three);
    this.camera = cameraOf(three);
    this.meshes = new ThreeDiceMeshes(three, this.view.document, options.look);
  }

  show(roll: DiceRendererRoll): void {
    if (this.shown.has(roll.rollId)) return;
    const played = playDiceThrow(roll.rollId, roll.throw, this.view.performance.now());
    const kinds = roll.throw.models.map((model) => model.kind);
    const objects = this.meshes.rollObjects(kinds, roll.appearance);
    this.shown.add(roll.rollId);
    this.scene.add(objects.root);
    this.live.set(roll.rollId, { played, objects });
    this.wake();
  }

  clear(): void {
    [...this.live.keys()].forEach((rollId) => this.drop(rollId));
    this.sleep();
  }

  destroy(): void {
    this.clear();
    this.meshes.dispose();
    this.gl.dispose();
    this.canvas.remove();
  }

  private wake(): void {
    this.canvas.style.display = 'block';
    if (this.frameId === null) this.frameId = this.view.requestAnimationFrame(this.frame);
  }

  // Idle costs nothing: no loop, and a hidden canvas the compositor skips.
  private sleep(): void {
    if (this.frameId !== null) this.view.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.canvas.style.display = 'none';
  }

  private readonly frame = (): void => {
    this.frameId = null;
    const nowMs = this.view.performance.now();
    this.pruneGone(nowMs);
    if (this.live.size === 0) {
      this.sleep();
      return;
    }
    this.fitToWindow();
    const scenes = diceSceneAt(
      [...this.live.values()].map((roll) => roll.played),
      nowMs,
    );
    this.live.forEach((roll, rollId) =>
      this.place(
        roll,
        scenes.find((s) => s.rollId === rollId),
      ),
    );
    this.gl.render(this.scene, this.camera);
    this.frameId = this.view.requestAnimationFrame(this.frame);
  };

  private pruneGone(nowMs: number): void {
    this.live.forEach((roll, rollId) => {
      if (isDiceThrowGone(roll.played, nowMs)) this.drop(rollId);
    });
  }

  private drop(rollId: string): void {
    const roll = this.live.get(rollId);
    if (roll === undefined) return;
    this.scene.remove(roll.objects.root);
    roll.objects.dispose();
    this.live.delete(rollId);
  }

  private fitToWindow(): void {
    const width = this.container?.clientWidth ?? this.view.innerWidth;
    const height = this.container?.clientHeight ?? this.view.innerHeight;
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    this.gl.setPixelRatio(Math.min(this.view.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.gl.setSize(width, height, false);
    Object.assign(this.camera, {
      left: -width / 2,
      right: width / 2,
      top: height / 2,
      bottom: -height / 2,
    });
    this.camera.updateProjectionMatrix();
  }

  private place(roll: LiveDiceRoll, scene: DiceSceneThrow | undefined): void {
    const { root, dice } = roll.objects;
    root.visible = scene !== undefined && this.size.width > 0 && this.size.height > 0;
    if (scene === undefined || !root.visible) return;
    root.scale.setScalar(diceStageScaleOf(scene.aspect, this.size) * this.zoom);
    roll.objects.setOpacity(scene.opacity);
    dice.forEach((die) => (die.visible = false));
    for (const { modelIndex, pose } of scene.dice) {
      const die = dice[modelIndex];
      if (die === undefined) continue;
      die.visible = true;
      die.position.set(pose.position.x, pose.position.y, pose.position.z);
      die.quaternion.set(
        pose.quaternion.x,
        pose.quaternion.y,
        pose.quaternion.z,
        pose.quaternion.w,
      );
    }
  }
}

/** Loads three.js on demand (its own chunk, never fetched while 3D is off) and opens the dice
 *  overlay on the document of `options.view`; `createGl` is WebGL in the app.
 *
 *  Example: `const renderer = await createThreeDiceRenderer({ look }); renderer.show(roll)` */
export async function createThreeDiceRenderer(
  options: ThreeDiceRendererOptions,
): Promise<DiceRenderer> {
  const three = await import('three');
  return new ThreeDiceRenderer(three, options);
}
