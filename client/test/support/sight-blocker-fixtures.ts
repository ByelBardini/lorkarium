import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';
import { sightOutline } from '@lorkarium/game-core';
import type { SightOutlines } from '@/lib/sight-geometry';
import { BIA_AT_TABLE, VHARN_SCENE, kael, lyra, vharnBoard } from './table-session-fixtures';

export const STATUE_ID = '11aa22bb-33cc-4d44-8e55-66ff77aa88bb';
export const OGRE_ID = '22bb33cc-44dd-4e55-9f66-77aa88bb99cc';
export const GOBLIN_ID = '33cc44dd-55ee-4f66-8a77-88bb99ccaadd';
export const TRACED_ASSET_ID = '44dd55ee-66ff-4a77-9b88-99ccaaddbbee';
export const UNTRACED_ASSET_ID = '55ee66ff-77aa-4b88-9c99-aaddbbeeccff';

/** Only the right tenth of the art: a statue traced like this leaves its center free, and in the
 *  one-cell statue at (4, 5) it still cuts the line that crosses from (1.5, 5.5) to the ogre. */
export const RIGHT_STRIP_OUTLINE = sightOutline([
  [
    [0.9, 0],
    [1, 0],
    [1, 1],
    [0.9, 1],
  ],
]);

/** Only the top tenth of the art: at (4, 5) it lets the line from Lyra to the ogre pass under it. */
export const TOP_STRIP_OUTLINE = sightOutline([
  [
    [0, 0],
    [1, 0],
    [1, 0.1],
    [0, 0.1],
  ],
]);

/** Bia as `buildBoardView` takes the viewer. */
export const LOOKOUT_BOARD_VIEWER = { userId: BIA_AT_TABLE.userId, isMaster: false };

/** The outlines with `TRACED_ASSET_ID` known.
 *
 *  Example: `sightGeometryOf(board, tracedOutlines(TOP_STRIP_OUTLINE))` */
export function tracedOutlines(outline = TOP_STRIP_OUTLINE): SightOutlines {
  return new Map([[TRACED_ASSET_ID, outline]]);
}

/** Lyra (Bia's) at (1, 5), center (1.5, 5.5), who sees 10 cells fully in the dark.
 *
 *  Example: `blockerBoard([lookout(), statue(), ogre()])` */
export function lookout(overrides: Partial<TokenDto> = {}): TokenDto {
  return lyra({ col: 1, row: 5, sight: { bright: 10, dim: 0 }, bars: [], ...overrides });
}

/** A statue that blocks sight at (4, 5), one cell, right between `lookout` and `ogre`; with an
 *  image and no outline known it blocks by the whole cell.
 *
 *  Example: `statue({ imageAssetId: TRACED_ASSET_ID })` */
export function statue(overrides: Partial<TokenDto> = {}): TokenDto {
  return kael({
    id: STATUE_ID,
    imageAssetId: UNTRACED_ASSET_ID,
    name: 'Estátua',
    canControl: false,
    controllerIds: [],
    col: 4,
    row: 5,
    blocksSight: true,
    ...overrides,
  });
}

/** An ogre at (7, 5), on the line of `lookout` beyond `statue`.
 *
 *  Example: `blockerBoard([lookout(), statue(), ogre()])` */
export function ogre(overrides: Partial<TokenDto> = {}): TokenDto {
  return kael({
    id: OGRE_ID,
    name: 'Ogro',
    canControl: false,
    controllerIds: [],
    side: 'enemy',
    col: 7,
    row: 5,
    ...overrides,
  });
}

/** A goblin far off the line, at (7, 9): no one's eye, no light, no blocker.
 *
 *  Example: `blockerBoard([lookout(), statue(), goblin()])` */
export function goblin(overrides: Partial<TokenDto> = {}): TokenDto {
  return ogre({ id: GOBLIN_ID, name: 'Goblin', col: 7, row: 9, ...overrides });
}

/** The dark VHARN board as Bia (a player) sees it, with these tokens.
 *
 *  Example: `blockerBoard([lookout(), statue(), ogre()], { walls: [cellDoor()] })` */
export function blockerBoard(
  tokens: readonly TokenDto[],
  overrides: Partial<BoardStateDto> = {},
): BoardStateDto {
  return vharnBoard({
    viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
    scene: { ...VHARN_SCENE, vision: 'dark' },
    tokens: [...tokens],
    ...overrides,
  });
}
