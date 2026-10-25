import { AURA_EFFECTS } from '@lorkarium/contracts';
import type {
  BoardStateDto,
  LightColorDto,
  LightDto,
  TokenDto,
  TokenLayerDto,
  WallDto,
} from '@lorkarium/contracts';
import { activeCondition, lyra, VHARN_SCENE, vharnBoard } from './table-session-fixtures';

// The target scale of docs/context/client/performance.md (and of the server's stress seed, which
// repeats this shape as rows): a 10 × 10 dungeon of rooms 10 cells wide, 3 tokens and 3 walls in
// each room, 40 map lights and 8 players.
const ROOMS_PER_SIDE = 10;
const ROOM_CELLS = 10;
const ROOMS = ROOMS_PER_SIDE * ROOMS_PER_SIDE;
const TOKENS_PER_ROOM = 3;
const LIGHTS = 40;
const PLAYERS = 8;
// Every 19th token is a player's: 16 eyes spread over the dungeon, two per player.
const PLAYER_TOKEN_STEP = 19;

/** A deterministic uuid: `kind` (1–9) tells tokens, walls, lights and people apart.
 *
 *  Example: `stressId(1, 0)` → `'10000000-0000-4000-8000-000000000000'` */
export function stressId(kind: number, index: number): string {
  return `${kind}0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

/** The 8 players of the stress scene; the first is the viewer of `stressBoardOf()`. */
export const STRESS_PLAYER_IDS: readonly string[] = Array.from({ length: PLAYERS }, (_, index) =>
  stressId(9, index),
);

const VIEWER_ID = STRESS_PLAYER_IDS[0] ?? '';

/** The stress scene of `docs/context/client/performance.md` as its first player sees it: 300
 *  tokens (art, initials, bars, conditions, 30 auras — 10 of them animated effects), 300 walls (≈900 segments, with doors, grates and
 *  curtains) and 40 lights on a dark 100 × 100 scene. The same board at every call.
 *
 *  Example: `buildBoardView({ ...localInput, ...stressBoardOf() })` */
export function stressBoardOf(): BoardStateDto {
  return vharnBoard({
    viewer: { userId: VIEWER_ID, role: 'player' },
    scene: { ...VHARN_SCENE, widthCells: 100, heightCells: 100, vision: 'dark' },
    tokens: Array.from({ length: ROOMS * TOKENS_PER_ROOM }, (_, index) => stressToken(index)),
    walls: Array.from({ length: ROOMS }, (_, room) => roomWalls(room)).flat(),
    lights: Array.from({ length: LIGHTS }, (_, index) => stressLight(index)),
  });
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

/** Token `index` of the stress scene: whose it is, where it stands and how it looks.
 *
 *  Example: `stressToken(0).canControl` → `true` (the viewer's first token) */
export function stressToken(index: number): TokenDto {
  const origin = roomOrigin(Math.floor(index / TOKENS_PER_ROOM));
  const slot = TOKEN_SLOTS[index % TOKENS_PER_ROOM] ?? TOKEN_SLOTS[0];
  const side = index % 25 === 24 ? 2 : 1;
  return lyra({
    id: stressId(1, index),
    name: `Token ${index}`,
    initials: `T${index % 100}`,
    width: side,
    height: side,
    col: origin.x + slot.col,
    row: origin.y + slot.row,
    layer: layerOf(index),
    ...artOf(index),
    facing: (index * 30) % 360,
    bars: barsOf(index),
    conditions: index % 5 === 0 ? [stressCondition(index)] : [],
    ...ownershipOf(index),
    aura: auraOf(index),
  });
}

// One token in 10 has an aura; a third of those is an animated effect (the eight in turn), the
// rest a color of the palette.
function auraOf(index: number): TokenDto['aura'] {
  if (index % 10 !== 5) return null;
  const nth = (index - 5) / 10;
  const radius = (nth % 3) + 1;
  if (nth % 3 !== 0) return { kind: 'color', radius, color: 'gold', opacity: 50 };
  const effect = AURA_EFFECTS[(nth / 3) % AURA_EFFECTS.length] ?? 'fire';
  return { kind: 'effect', radius, effect, color: null, opacity: 100 };
}

function layerOf(index: number): TokenLayerDto {
  if (index % 50 === 49) return 'background';
  return index % 20 === 19 ? 'objects' : 'tokens';
}

function artOf(index: number): Pick<TokenDto, 'imageAssetId' | 'frame' | 'flipX'> {
  if (index % 3 !== 0) return { imageAssetId: null, frame: 'square', flipX: false };
  return {
    imageAssetId: stressId(5, index % 12),
    frame: index % 2 === 0 ? 'round' : 'square',
    flipX: index % 4 === 0,
  };
}

function barsOf(index: number): TokenDto['bars'] {
  return lyra().bars.map((bar, position) => ({
    ...bar,
    id: stressId(3, index * 2 + position),
    current: position === 0 ? (index % 45) + 1 : bar.current,
  }));
}

function stressCondition(index: number): TokenDto['conditions'][number] {
  return activeCondition({ id: stressId(4, index), remainingRounds: (index % 3) + 1 });
}

// A player's token sees in the dark and is the viewer's only if the first player controls it;
// every tenth token carries a lit torch.
function ownershipOf(
  index: number,
): Pick<TokenDto, 'controllerIds' | 'canControl' | 'sight' | 'side' | 'light' | 'lightLit'> {
  const torch =
    index % 10 === 0 ? { bright: 4, dim: 4, color: 'torch' as const, angle: 360 } : null;
  const lit = { light: torch, lightLit: torch !== null };
  if (index % PLAYER_TOKEN_STEP !== 0) {
    const side = index % 7 === 0 ? 'neutral' : 'enemy';
    return { controllerIds: [], canControl: false, sight: null, side, ...lit };
  }
  const player = STRESS_PLAYER_IDS[(index / PLAYER_TOKEN_STEP) % PLAYERS] ?? VIEWER_ID;
  const sight = { bright: 6, dim: 6 };
  const canControl = player === VIEWER_ID;
  return { controllerIds: [player], canControl, sight, side: 'ally', ...lit };
}

const DOOR_STATES = ['closed', 'open', 'locked'] as const;

// Three walls per room, nine segments: the north wall with a notch, a door in its gap and the west
// wall with a jamb. One room in ten has a grate for the north wall, another a curtain.
function roomWalls(room: number): WallDto[] {
  const { x, y } = roomOrigin(room);
  return [northWall(room, x, y), roomDoor(room, x + 4, y), westWall(room, x, y + 3)];
}

function northWall(room: number, x: number, y: number): WallDto {
  const kind = room % 10 === 3 ? 'grate' : room % 10 === 7 ? 'curtain' : 'wall';
  return {
    ...freehandAt(stressId(2, room * 3), x, y, 4, 1),
    kind,
    points: [
      [0, 1],
      [0, 0],
      [4, 0],
      [4, 1],
      [3.5, 1],
    ],
  };
}

function roomDoor(room: number, x: number, y: number): WallDto {
  return {
    ...freehandAt(stressId(2, room * 3 + 1), x, y, 2, 0),
    kind: 'door',
    shape: 'line',
    points: [
      [0, 0],
      [2, 0],
    ],
    doorState: DOOR_STATES[room % DOOR_STATES.length] ?? 'closed',
  };
}

function westWall(room: number, x: number, y: number): WallDto {
  return {
    ...freehandAt(stressId(2, room * 3 + 2), x, y, 1, 7),
    points: [
      [1, 0],
      [0, 0],
      [0, 7],
      [1, 7],
      [1, 6.5],
    ],
  };
}

type PathWallDto = Extract<WallDto, { points: unknown }>;

function freehandAt(id: string, x: number, y: number, width: number, height: number): PathWallDto {
  return { id, kind: 'wall', shape: 'freehand', x, y, width, height, points: [], doorState: null };
}

const LIGHT_COLORS: readonly (LightColorDto | null)[] = [null, 'torch', 'fire', 'moon', 'arcane'];

// 37 is coprime with 100: the 40 lights land in 40 different rooms.
function stressLight(index: number): LightDto {
  const { x, y } = roomOrigin((index * 37 + 11) % ROOMS);
  return {
    id: stressId(6, index),
    x: x + 5.5,
    y: y + 5.5,
    bright: 3,
    dim: 3,
    lit: index % 8 !== 7,
    color: LIGHT_COLORS[index % LIGHT_COLORS.length] ?? null,
    facing: (index * 45) % 360,
    angle: index % 10 === 5 ? 90 : 360,
  };
}
