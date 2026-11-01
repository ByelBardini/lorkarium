import type { DoorStateDto, WallKindDto } from '@lorkarium/contracts';
import { Container, Graphics } from 'pixi.js';
import {
  DOOR_ICON_SCREEN_PX,
  dashesOf,
  type DoorIconView,
  type WallStroke,
  type WallView,
} from './wall-view';

// Design system colors (client/src/index.css): the canvas cannot read CSS variables.
const GOLD = 0xc5a46d;
const STEEL = 0x8a9bb8;
const VIOLET = 0x9a86b8;
const EMBER = 0xb5654f;
const MOSS = 0x7f9a7a;
const BONE = 0xeae5da;
const PANEL = 0x0c0e11;

const LINE_SCREEN_PX = 3;
const HALO_SCREEN_PX = 9;
const FAINT_ALPHA = 0.35;
// [on, off] in screen px: Grade dashed, Cortina dotted, the others solid.
const DASH_SCREEN_PX: Readonly<Record<WallKindDto, readonly [number, number] | null>> = {
  wall: null,
  grate: [12, 8],
  curtain: [3, 6],
  door: null,
};

/** The walls on the canvas: the master's lines (above the tokens and the fog, at 3 px of screen
 *  whatever the zoom; faint without the walls tool) and the door icons (16 px of screen). Redrawn
 *  on each draw and camera change; the strokes an erase would take glow ember. Proven by the e2e. */
export class PixiWallLayer {
  readonly lines = new Graphics();
  readonly doors = new Container();
  private readonly doorShapes = new Graphics();
  private drawn: Readonly<{
    walls: readonly WallView[];
    doors: readonly DoorIconView[];
    zoom: number;
  }> = {
    walls: [],
    doors: [],
    zoom: 1,
  };
  private erased: readonly WallStroke[] = [];

  constructor() {
    this.doors.addChild(this.doorShapes);
  }

  draw(walls: readonly WallView[], doors: readonly DoorIconView[], zoom: number): void {
    this.drawn = { walls, doors, zoom };
    this.lines.clear();
    for (const wall of walls) this.drawWall(wall, zoom);
    this.drawErased(zoom);
    this.doorShapes.clear();
    for (const door of doors) drawDoorIcon(this.doorShapes, door, zoom);
  }

  /** The strokes under the pointer an erase would take (none: nothing lit). */
  lightErase(strokes: readonly WallStroke[]): void {
    if (strokes.length === 0 && this.erased.length === 0) return;
    this.erased = strokes;
    this.redraw();
  }

  private redraw(): void {
    const { walls, doors, zoom } = this.drawn;
    this.draw(walls, doors, zoom);
  }

  private drawErased(zoom: number): void {
    if (this.erased.length === 0) return;
    for (const stroke of this.erased) strokeOf(this.lines, stroke);
    this.lines.stroke({ width: HALO_SCREEN_PX / zoom, color: EMBER, alpha: 0.7, cap: 'round' });
  }

  private drawWall(wall: WallView, zoom: number): void {
    const alpha = wall.emphasis === 'full' ? 1 : FAINT_ALPHA;
    if (wall.selected) {
      for (const stroke of wall.segments) strokeOf(this.lines, stroke);
      this.lines.stroke({ width: HALO_SCREEN_PX / zoom, color: GOLD, alpha: 0.4, cap: 'round' });
    }
    const pattern = scaled(DASH_SCREEN_PX[wall.kind], zoom);
    for (const stroke of wall.segments) {
      for (const piece of dashesOf(stroke, pattern)) strokeOf(this.lines, piece);
    }
    const color = wallColor(wall.kind, wall.doorState);
    this.lines.stroke({ width: LINE_SCREEN_PX / zoom, color, alpha, cap: 'round' });
  }
}

function strokeOf(graphics: Graphics, { from, to }: WallStroke): void {
  graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
}

function scaled(pattern: readonly [number, number] | null, zoom: number) {
  return pattern && ([pattern[0] / zoom, pattern[1] / zoom] as const);
}

function wallColor(kind: WallKindDto, doorState: DoorStateDto | null): number {
  if (kind === 'grate') return STEEL;
  if (kind === 'curtain') return VIOLET;
  if (kind === 'door') return doorState === 'open' ? MOSS : EMBER;
  return GOLD;
}

// Closed: an ember block. Open: a moss frame. Locked: the ember block with a bone padlock.
function drawDoorIcon(graphics: Graphics, door: DoorIconView, zoom: number): void {
  const size = DOOR_ICON_SCREEN_PX / zoom;
  const left = door.x - size / 2;
  const top = door.y - size / 2;
  graphics.rect(left, top, size, size);
  if (door.state === 'open') {
    graphics.fill({ color: PANEL, alpha: 0.85 }).stroke({ width: 2 / zoom, color: MOSS });
    return;
  }
  graphics.fill(EMBER).stroke({ width: 1 / zoom, color: PANEL });
  if (door.state !== 'locked') return;
  const unit = size / 8;
  graphics.rect(door.x - 2 * unit, door.y - unit / 2, 4 * unit, 3 * unit).fill(BONE);
  // PixiJS 8 opens the path after a fill at the last point (the origin after a rect): without
  // this moveTo the shackle is stroked from (0, 0), a long white line across the map.
  const shackle = 1.3 * unit;
  graphics.moveTo(door.x - shackle, door.y - unit / 2);
  graphics.arc(door.x, door.y - unit / 2, shackle, Math.PI, 0);
  graphics.stroke({ width: unit / 1.5, color: BONE });
}
