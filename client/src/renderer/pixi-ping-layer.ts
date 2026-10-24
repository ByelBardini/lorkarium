import { Container, Graphics, Text } from 'pixi.js';
import {
  CELL_WORLD_SIZE,
  worldToScreen,
  zoomProofTextResolution,
  type Camera,
  type Size,
} from './camera';
import type { PingMark } from './board-renderer';
import { pingEdgeOf } from './ping-edge';
import { pingPulseAt, type PingPulse } from './ping-pulse';

/** The most pings on the board at once: the next one takes out the oldest. */
export const PINGS_ON_SCREEN_MAX = 30;

const RING_RADIUS = CELL_WORLD_SIZE * 1.25;
const RING_WIDTH = 4;
const DOT_RADIUS = 6;
const LABEL_GAP = 10;
const EDGE_MARGIN = 24;
const ARROW_SIZE = 14;
// Design system tokens (client/src/index.css): dark text and outline, readable on any color.
const INK_COLOR = 0x1b1f25;

/** Makes the name plate of a ping, with (0, 0) at its bottom center. */
export type PingLabelMaker = (label: string, color: number) => Container;

/** What the arrows need each frame: the camera and the size of the canvas. */
export type PingFrame = Readonly<{ camera: Camera; screen: Size }>;

type LivePing = {
  readonly mark: PingMark;
  readonly body: Container;
  readonly ring: Graphics;
  readonly arrow: Graphics;
  elapsed: number;
};

/** The pings on the board: `world` goes in the world container (ring, dot and plate follow the
 *  camera), `edges` on the stage (the arrows of pings off screen, in screen px). Only `animate`
 *  draws, and with no ping alive it touches nothing.
 *
 *  Example: `pings.show({ x: 5.5, y: 2.2, label: 'Bia', color }); pings.animate(ticker.deltaMS, frame)` */
export class PixiPingLayer {
  readonly world = new Container();
  readonly edges = new Container();
  private readonly alive: LivePing[] = [];

  constructor(
    private readonly reducedMotion: () => boolean,
    private readonly labelOf: PingLabelMaker = pingLabelOf,
  ) {}

  show(mark: PingMark): void {
    const oldest = this.alive[0];
    if (oldest && this.alive.length >= PINGS_ON_SCREEN_MAX) this.remove(oldest);
    this.alive.push(this.build(mark));
  }

  /** Moves every ping `deltaMs` on; whether a render is due (`false`: no ping, nothing done). */
  animate(deltaMs: number, frame: PingFrame): boolean {
    if (this.alive.length === 0) return false;
    const reduced = this.reducedMotion();
    for (const ping of [...this.alive]) this.step(ping, deltaMs, reduced, frame);
    return true;
  }

  aliveCount(): number {
    return this.alive.length;
  }

  private build(mark: PingMark): LivePing {
    const body = new Container();
    body.position.set(mark.x * CELL_WORLD_SIZE, mark.y * CELL_WORLD_SIZE);
    const ring = new Graphics();
    const dot = new Graphics().circle(0, 0, DOT_RADIUS).fill(mark.color).stroke(INK_COLOR);
    const label = this.labelOf(mark.label, mark.color);
    label.position.set(0, -(DOT_RADIUS + LABEL_GAP));
    body.addChild(ring, dot, label);
    this.world.addChild(body);
    const arrow = arrowOf(mark.color);
    this.edges.addChild(arrow);
    return { mark, body, ring, arrow, elapsed: 0 };
  }

  private step(ping: LivePing, deltaMs: number, reduced: boolean, frame: PingFrame): void {
    ping.elapsed += deltaMs;
    const pulse = pingPulseAt(ping.elapsed, reduced);
    if (!pulse) return this.remove(ping);
    drawRing(ping.ring, ping.mark.color, pulse);
    placeArrow(ping, frame, pulse);
  }

  private remove(ping: LivePing): void {
    this.alive.splice(this.alive.indexOf(ping), 1);
    ping.body.destroy({ children: true });
    ping.arrow.destroy();
  }
}

function drawRing(ring: Graphics, color: number, pulse: PingPulse): void {
  ring
    .clear()
    .circle(0, 0, RING_RADIUS * pulse.radius)
    .stroke({ width: RING_WIDTH, color });
  ring.alpha = pulse.alpha;
}

// The arrow pulses with the ring: never fully gone while the ping lives.
function placeArrow(ping: LivePing, { camera, screen }: PingFrame, pulse: PingPulse): void {
  const center = worldToScreen(camera, ping.body.position);
  const edge = pingEdgeOf(center, screen, EDGE_MARGIN);
  ping.arrow.visible = edge !== null;
  if (!edge) return;
  ping.arrow.position.set(edge.x, edge.y);
  ping.arrow.rotation = edge.angle;
  ping.arrow.alpha = 0.4 + 0.6 * pulse.alpha;
}

// A triangle pointing along +x, so `rotation` is the angle toward the ping.
function arrowOf(color: number): Graphics {
  const wing = ARROW_SIZE * 0.7;
  return new Graphics()
    .poly([ARROW_SIZE, 0, -wing, wing, -wing, -wing])
    .fill(color)
    .stroke({ width: 2, color: INK_COLOR });
}

/** The real plate: the name in dark text on the ping color. Measures text, so it runs in the
 *  browser only (the spec hands the layer a fake maker). */
export function pingLabelOf(label: string, color: number): Container {
  const text = new Text({
    text: label,
    resolution: zoomProofTextResolution(globalThis.devicePixelRatio),
    style: { fontFamily: 'Hanken Grotesk Variable, sans-serif', fontWeight: '700', fontSize: 15 },
  });
  text.style.fill = INK_COLOR;
  text.anchor.set(0.5, 1);
  text.position.set(0, -2);
  const plate = new Graphics()
    .roundRect(-text.width / 2 - 6, -text.height - 4, text.width + 12, text.height + 4, 3)
    .fill(color);
  const container = new Container();
  container.addChild(plate, text);
  return container;
}
