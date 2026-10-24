import {
  TOKEN_GROUP_MAX,
  type LightColorDto,
  type NewTokenDto,
  type SceneVisionDto,
  type TokenLayerDto,
  type WallShapeDto,
} from '@lorkarium/contracts';
import type { NodeEnv } from '../../config/env';
import type { CreateLights } from '../lights/lights.service';
import type { SceneGrid } from '../scenes/scene-config.bo';
import { StressSeedRefusedError } from './dev-seed.error';

/** The name of Bia's stress table; the seed skips when she already masters one. */
export const STRESS_CAMPAIGN_NAME = 'Mesa de estresse';

type LightPlacement = CreateLights['lights'][number];

/** What the stress table holds (docs/context/client/performance.md), as the services take it. */
export type StressScene = Readonly<{
  grid: SceneGrid;
  vision: SceneVisionDto;
  tokens: NewTokenDto[];
  walls: WallShapeDto[];
  lights: LightPlacement[];
}>;

// The same dungeon as the client's bench (client/test/support/stress-board.ts), as rows: 10 × 10
// rooms of 10 cells, 3 tokens and 3 walls each, 40 lights. Without art nor conditions, which need
// assets and definitions of their own.
const ROOMS_PER_SIDE = 10;
const ROOM_CELLS = 10;
const ROOMS = ROOMS_PER_SIDE * ROOMS_PER_SIDE;
const TOKENS_PER_ROOM = 3;
const LIGHTS = 40;
const PLAYER_TOKEN_STEP = 19;
// Of the 16 eyes of the bench, the player gets the two of the first of 8 players.
const PLAYER_TOKENS = [0, 152];

const STRESS_GRID: SceneGrid = {
  widthCells: ROOMS_PER_SIDE * ROOM_CELLS,
  heightCells: ROOMS_PER_SIDE * ROOM_CELLS,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 30,
};

/** The stress table with `playerId` controlling two tokens that see in the dark.
 *
 *  Example: `stressSceneOf(caio.id).tokens.length` → `300` */
export function stressSceneOf(playerId: string): StressScene {
  return {
    grid: STRESS_GRID,
    vision: 'dark',
    tokens: Array.from({ length: ROOMS * TOKENS_PER_ROOM }, (_, index) =>
      stressTokenOf(index, playerId),
    ),
    walls: Array.from({ length: ROOMS }, (_, room) => roomWallsOf(room)).flat(),
    lights: Array.from({ length: LIGHTS }, (_, index) => stressLightOf(index)),
  };
}

/** The items cut in commands the board accepts (`TOKEN_GROUP_MAX` each), in order.
 *
 *  Example: `inStressBatches(scene.tokens).length` → `5` */
export function inStressBatches<T>(items: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += TOKEN_GROUP_MAX) {
    batches.push(items.slice(start, start + TOKEN_GROUP_MAX));
  }
  return batches;
}

/** The stress table never lands on production data.
 *
 *  Example: `requireStressSeedAllowed(env.nodeEnv)` */
export function requireStressSeedAllowed(nodeEnv: NodeEnv): void {
  if (nodeEnv === 'production') throw new StressSeedRefusedError(nodeEnv);
}

function roomOrigin(room: number): Readonly<{ x: number; y: number }> {
  return {
    x: (room % ROOMS_PER_SIDE) * ROOM_CELLS,
    y: Math.floor(room / ROOMS_PER_SIDE) * ROOM_CELLS,
  };
}

const TOKEN_SLOTS = [
  { col: 2, row: 2 },
  { col: 5, row: 6 },
  { col: 7, row: 3 },
] as const;

function stressTokenOf(index: number, playerId: string): NewTokenDto {
  const origin = roomOrigin(Math.floor(index / TOKENS_PER_ROOM));
  const slot = TOKEN_SLOTS[index % TOKENS_PER_ROOM] ?? TOKEN_SLOTS[0];
  const side = index % 25 === 24 ? 2 : 1;
  const mine = PLAYER_TOKENS.includes(index);
  return {
    name: `Token ${index}`,
    initials: `T${index % 100}`,
    side: sideOf(index),
    ...{ width: side, height: side, col: origin.x + slot.col, row: origin.y + slot.row },
    layer: layerOf(index),
    ...{ imageAssetId: null, frame: 'square', flipX: false, flipY: false },
    ...{ facing: (index * 30) % 360, sightAngle: 360 },
    controllerIds: mine ? [playerId] : [],
    sight: index % PLAYER_TOKEN_STEP === 0 ? { bright: 6, dim: 6 } : null,
    light: index % 10 === 0 ? { bright: 4, dim: 4, color: 'torch', angle: 360 } : null,
    bars: barsOf(index),
  };
}

function sideOf(index: number): NewTokenDto['side'] {
  if (index % PLAYER_TOKEN_STEP === 0) return 'ally';
  return index % 7 === 0 ? 'neutral' : 'enemy';
}

function layerOf(index: number): TokenLayerDto {
  if (index % 50 === 49) return 'background';
  return index % 20 === 19 ? 'objects' : 'tokens';
}

function barsOf(index: number): NewTokenDto['bars'] {
  return [
    {
      ...{ label: 'PV', current: (index % 45) + 1, max: 45, color: 'ember' },
      ...{ visibility: 'controllers', display: 'number' },
    },
    {
      ...{ label: 'Inspiração', current: 1, max: 1, color: 'gold' },
      ...{ visibility: 'everyone', display: 'number' },
    },
  ];
}

// Three walls per room, nine segments: the notched north wall (a grate in one room in ten, a
// curtain in another), a door in its gap and the west wall with a jamb. A door is born closed.
function roomWallsOf(room: number): WallShapeDto[] {
  const { x, y } = roomOrigin(room);
  const kind = room % 10 === 3 ? 'grate' : room % 10 === 7 ? 'curtain' : 'wall';
  const north = pathWall(kind, x, y, 4, 1, [
    [0, 1],
    [0, 0],
    [4, 0],
    [4, 1],
    [3.5, 1],
  ]);
  const door: WallShapeDto = { ...pathWall('door', x + 4, y, 2, 0, DOOR_LINE), shape: 'line' };
  const west = pathWall('wall', x, y + 3, 1, 7, [
    [1, 0],
    [0, 0],
    [0, 7],
    [1, 7],
    [1, 6.5],
  ]);
  return [north, door, west];
}

const DOOR_LINE: [number, number][] = [
  [0, 0],
  [2, 0],
];

function pathWall(
  kind: WallShapeDto['kind'],
  x: number,
  y: number,
  width: number,
  height: number,
  points: [number, number][],
): Extract<WallShapeDto, { shape: 'freehand' | 'line' }> {
  return { kind, shape: 'freehand', x, y, width, height, points };
}

const LIGHT_COLORS: readonly (LightColorDto | null)[] = [null, 'torch', 'fire', 'moon', 'arcane'];

// 37 is coprime with 100: the 40 lights land in 40 different rooms. A light is born lit.
function stressLightOf(index: number): LightPlacement {
  const { x, y } = roomOrigin((index * 37 + 11) % ROOMS);
  return {
    x: x + 5.5,
    y: y + 5.5,
    bright: 3,
    dim: 3,
    color: LIGHT_COLORS[index % LIGHT_COLORS.length] ?? null,
    facing: (index * 45) % 360,
    angle: index % 10 === 5 ? 90 : 360,
  };
}
