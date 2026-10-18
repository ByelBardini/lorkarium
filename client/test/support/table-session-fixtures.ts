import type {
  ActiveConditionDto,
  BoardStateDto,
  CombatDto,
  SceneDto,
  SceneUpdatedDto,
  SessionMemberDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionStateDto,
  TokenDto,
  TokensDraggedDto,
} from '@lorkarium/contracts';
import type { BoardEvent } from '@/services/board-events';
import { ANA } from './auth-api-fake';
import { VHARN } from './campaigns-api-fake';

export const ANA_AT_TABLE: SessionMemberDto = {
  userId: ANA.id,
  name: 'Ana',
  role: 'master',
  online: true,
};

export const BIA_AT_TABLE: SessionMemberDto = {
  userId: '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f',
  name: 'Bia',
  role: 'player',
  online: false,
};

export const CAIO_AT_TABLE: SessionMemberDto = {
  userId: 'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f',
  name: 'Caio',
  role: 'player',
  online: true,
};

const AT = '2026-10-15T12:00:00.000Z';

/** The VHARN snapshot: Ana and Caio online, Bia offline, unless overridden.
 *
 *  Example: `vharnState({ version: 3 })` */
export function vharnState(overrides: Partial<SessionStateDto> = {}): SessionStateDto {
  return {
    campaignId: VHARN.id,
    version: 1,
    members: [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE],
    at: AT,
    ...overrides,
  };
}

/** `session:memberJoined` of Bia at VHARN.
 *
 *  Example: `biaJoined({ version: 2 })` */
export function biaJoined(overrides: Partial<SessionMemberJoinedDto> = {}): SessionMemberJoinedDto {
  return {
    campaignId: VHARN.id,
    version: 2,
    member: { ...BIA_AT_TABLE, online: true },
    at: AT,
    ...overrides,
  };
}

/** `session:memberLeft` of Bia at VHARN.
 *
 *  Example: `biaLeft({ version: 3 })` */
export function biaLeft(overrides: Partial<SessionMemberLeftDto> = {}): SessionMemberLeftDto {
  return { campaignId: VHARN.id, version: 3, userId: BIA_AT_TABLE.userId, at: AT, ...overrides };
}

export const VHARN_SCENE: SceneDto = {
  id: '7d3c2b1a-0f9e-4d8c-b7a6-5e4d3c2b1a0f',
  name: 'Cena 1',
  widthCells: 20,
  heightCells: 12,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 30,
  background: null,
};

/** The VHARN board as Ana (master) sees it at version 4: the empty default scene, no combat.
 *
 *  Example: `vharnBoard({ version: 7, viewer: { userId: BIA_AT_TABLE.userId, role: 'player' } })` */
export function vharnBoard(overrides: Partial<BoardStateDto> = {}): BoardStateDto {
  return {
    campaignId: VHARN.id,
    version: 4,
    at: AT,
    viewer: { userId: ANA.id, role: 'master' },
    scene: VHARN_SCENE,
    tokens: [],
    drawings: [],
    combat: null,
    conditionDefinitions: [],
    ...overrides,
  };
}

/** `scene:updated` of VHARN with a 30×20 grid, one version after `vharnBoard()`.
 *
 *  Example: `sceneUpdated({ version: 6 })` */
export function sceneUpdated(overrides: Partial<SceneUpdatedDto> = {}): SceneUpdatedDto {
  return {
    campaignId: VHARN.id,
    version: 5,
    at: AT,
    scene: { ...VHARN_SCENE, widthCells: 30, heightCells: 20 },
    ...overrides,
  };
}

export const LYRA_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
export const LYRA_PV_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

/** Lyra, Bia's ally at (3, 4), as the master (privileged) sees it: hidden PV 32/45 and
 *  Inspiração 1/1.
 *
 *  Example: `lyra({ canControl: false, bars: [] })` */
export function lyra(overrides: Partial<TokenDto> = {}): TokenDto {
  return {
    id: LYRA_ID,
    name: 'Lyra',
    initials: 'LY',
    side: 'ally',
    width: 1,
    height: 1,
    col: 3,
    row: 4,
    layer: 'tokens',
    controllerIds: [BIA_AT_TABLE.userId],
    imageAssetId: null,
    frame: 'square',
    flipX: false,
    flipY: false,
    facing: 0,
    canControl: true,
    bars: [
      {
        id: LYRA_PV_ID,
        position: 0,
        label: 'PV',
        current: 32,
        max: 45,
        color: 'ember',
        visibility: 'controllers',
      },
      {
        id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
        position: 1,
        label: 'Inspiração',
        current: 1,
        max: 1,
        color: 'gold',
        visibility: 'everyone',
      },
    ],
    conditions: [],
    ...overrides,
  };
}

/** `token:created` of `token` at VHARN, as a board event.
 *
 *  Example: `tokenCreatedAt(5, lyra())` */
export function tokenCreatedAt(version: number, token: TokenDto): BoardEvent {
  return { type: 'tokenCreated', payload: { campaignId: VHARN.id, version, at: AT, token } };
}

/** `token:updated` of `token` at VHARN, as a board event. */
export function tokenUpdatedAt(version: number, token: TokenDto): BoardEvent {
  return { type: 'tokenUpdated', payload: { campaignId: VHARN.id, version, at: AT, token } };
}

/** `token:moved` of Lyra (unless told otherwise) at VHARN, as a board event.
 *
 *  Example: `tokenMovedAt(6, { col: 8, row: 6 })` */
export function tokenMovedAt(
  version: number,
  { col, row, tokenId = LYRA_ID }: Readonly<{ col: number; row: number; tokenId?: string }>,
): BoardEvent {
  return {
    type: 'tokenMoved',
    payload: { campaignId: VHARN.id, version, at: AT, tokenId, col, row },
  };
}

/** `token:deleted` of `tokenId` at VHARN, as a board event. */
export function tokenDeletedAt(version: number, tokenId = LYRA_ID): BoardEvent {
  return {
    type: 'tokenDeleted',
    payload: { campaignId: VHARN.id, version, at: AT, tokenId, combat: null },
  };
}

export const KAEL_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';

/** Kael, a second ally at (5, 4) under the master's control, with no bars.
 *
 *  Example: `vharnBoard({ tokens: [lyra(), kael()] })` */
export function kael(overrides: Partial<TokenDto> = {}): TokenDto {
  return lyra({
    id: KAEL_ID,
    name: 'Kael',
    initials: 'KA',
    col: 5,
    row: 4,
    bars: [],
    ...overrides,
  });
}

/** `token:draggedMany` at VHARN; a `null` cell ends that token's drag.
 *
 *  Example: `groupDraggedOver([{ tokenId: LYRA_ID, cell: { col: 5, row: 4 } }])` */
export function groupDraggedOver(
  drags: TokensDraggedDto['drags'],
  overrides: Partial<TokensDraggedDto> = {},
): TokensDraggedDto {
  return { campaignId: VHARN.id, at: AT, drags, ...overrides };
}

export const KAEL_COMBATANT = 'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c';
export const LYRA_COMBATANT = 'c2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d';

/** A combat at VHARN: round 1, Kael (18) on turn, then Lyra (14).
 *
 *  Example: `vharnCombat({ round: 3 })` */
export function vharnCombat(overrides: Partial<CombatDto> = {}): CombatDto {
  return {
    id: 'c3c4d5e6-f7a8-4b9c-8d1e-2f3a4b5c6d7e',
    round: 1,
    currentCombatantId: KAEL_COMBATANT,
    combatants: [
      { id: KAEL_COMBATANT, tokenId: 'kael-token', initiative: 18, tieOrder: 0 },
      { id: LYRA_COMBATANT, tokenId: LYRA_ID, initiative: 14, tieOrder: 1 },
    ],
    ...overrides,
  };
}

/** A condition active on a token. */
export function activeCondition(overrides: Partial<ActiveConditionDto> = {}): ActiveConditionDto {
  return {
    id: 'a4d5e6f7-a8b9-4c0d-9e2f-3a4b5c6d7e8f',
    conditionId: 'd5e6f7a8-b9c0-4d1e-8f3a-4b5c6d7e8f90',
    name: 'Envenenado',
    tone: 'harm',
    icon: 'flask-conical',
    remainingRounds: 2,
    ...overrides,
  };
}

/** Any board event of VHARN at `version`, built from its type and the fields of its payload. */
export function eventAt(version: number, event: DistributiveOmit<BoardEvent>): BoardEvent {
  return {
    ...event,
    payload: { ...event.payload, campaignId: VHARN.id, version, at: AT },
  } as BoardEvent;
}

type DistributiveOmit<E> = E extends { type: infer T; payload: infer P }
  ? { type: T; payload: Omit<P, 'campaignId' | 'version' | 'at'> }
  : never;
