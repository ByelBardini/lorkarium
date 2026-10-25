import type {
  BoardPingedDto,
  MemberCardDto,
  ActiveConditionDto,
  BoardStateDto,
  ConditionDefinitionDto,
  CombatantDto,
  CombatDto,
  SceneDto,
  SceneUpdatedDto,
  SessionCampaignDeletedDto,
  SessionCampaignUpdatedDto,
  SessionMemberDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionMemberUpdatedDto,
  SessionStateDto,
  TokenDto,
  TokensDraggedDto,
  VeiledLightDto,
  VeiledLightsChangedDto,
} from '@lorkarium/contracts';
import type { BoardEvent } from '@/services/board-events';
import { ANA } from './auth-api-fake';
import { VHARN } from './campaigns-api-fake';

export const ANA_AT_TABLE: SessionMemberDto = {
  userId: ANA.id,
  name: 'Ana',
  username: 'ana',
  color: 'teal',
  avatarId: null,
  bio: null,
  role: 'master',
  online: true,
  awaySince: null,
};

export const BIA_AT_TABLE: SessionMemberDto = {
  userId: '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f',
  name: 'Bia',
  username: 'bia',
  color: 'moss',
  avatarId: null,
  bio: null,
  role: 'player',
  online: false,
  awaySince: null,
};

export const CAIO_AT_TABLE: SessionMemberDto = {
  userId: 'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f',
  name: 'Caio',
  username: 'caio',
  color: 'steel',
  avatarId: null,
  bio: null,
  role: 'player',
  online: true,
  awaySince: null,
};

/** Duda, a spectator of VHARN online (the same id as in `campaigns-api-fake.ts`), unless
 *  overridden. She is in no snapshot by default: a spectator is listed only while online.
 *
 *  Example: `vharnState({ members: [ANA_AT_TABLE, duda()] })`, `duda({ role: 'player' })` */
export function duda(overrides: Partial<SessionMemberDto> = {}): SessionMemberDto {
  return {
    userId: '1e2d3c4b-5a69-4788-9abc-def012345678',
    name: 'Duda',
    username: 'duda',
    color: 'teal',
    avatarId: null,
    bio: null,
    role: 'spectator',
    online: true,
    awaySince: null,
    ...overrides,
  };
}

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
    member: { ...BIA_AT_TABLE, online: true, awaySince: null },
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

/** `session:memberUpdated` of Bia at VHARN: she chose rose and wrote a bio (the server sends her
 *  whole member, offline as the roster has her).
 *
 *  Example: `biaUpdated({ version: 5 })` */
export function biaUpdated(
  overrides: Partial<SessionMemberUpdatedDto> = {},
): SessionMemberUpdatedDto {
  return {
    campaignId: VHARN.id,
    version: 2,
    member: { ...BIA_AT_TABLE, name: 'Bia Rosa', color: 'rose', bio: 'Barda de Vharn.' },
    at: AT,
    ...overrides,
  };
}

/** `session:campaignUpdated` of VHARN: the master renamed it and chose an image cover.
 *
 *  Example: `vharnRenamed({ version: 5 })` */
export function vharnRenamed(
  overrides: Partial<SessionCampaignUpdatedDto> = {},
): SessionCampaignUpdatedDto {
  return {
    campaignId: VHARN.id,
    version: 2,
    campaign: {
      id: VHARN.id,
      name: 'Os Sinos Calados',
      system: VHARN.system,
      status: VHARN.status,
      description: VHARN.description,
      visibility: VHARN.visibility,
      masterName: VHARN.masterName,
      memberCount: VHARN.memberCount,
      contentWarnings: VHARN.contentWarnings,
      tags: VHARN.tags,
      cover: { kind: 'image', assetId: 'e1d2c3b4-a596-4877-8899-aabbccddeeff' },
    },
    at: AT,
    ...overrides,
  };
}

/** `session:campaignDeleted` of VHARN.
 *
 *  Example: `vharnDeleted({ campaignId: QUELM.id })` */
export function vharnDeleted(
  overrides: Partial<SessionCampaignDeletedDto> = {},
): SessionCampaignDeletedDto {
  return { campaignId: VHARN.id, at: AT, ...overrides };
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
  vision: 'off',
};

/** The scope of VHARN's group grid (`VHARN_SCENE`): where the room's commands go by default. */
export const VHARN_GRID = { campaignId: VHARN.id, sceneId: VHARN_SCENE.id } as const;

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
    effectAreas: [],
    walls: [],
    lights: [],
    veiledLights: [],
    combat: null,
    conditionDefinitions: [],
    mainTokens: [],
    memberCards: [],
    ...overrides,
  };
}

/** `scene:updated` of VHARN with a 30×20 grid, one version after `vharnBoard()`.
 *
 *  Example: `sceneUpdated({ version: 6 })` */
export function sceneUpdated(overrides: Partial<SceneUpdatedDto> = {}): SceneUpdatedDto {
  return {
    campaignId: VHARN.id,
    sceneId: VHARN_SCENE.id,
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
    sightAngle: 360,
    defeated: false,
    sight: null,
    light: null,
    lightLit: true,
    hidden: false,
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
        display: 'number',
      },
      {
        id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
        position: 1,
        label: 'Inspiração',
        current: 1,
        max: 1,
        color: 'gold',
        visibility: 'everyone',
        display: 'number',
      },
    ],
    conditions: [],
    anchorTokenId: null,
    ...overrides,
  };
}

/** `token:created` of `token` at VHARN, as a board event.
 *
 *  Example: `tokenCreatedAt(5, lyra())` */
export function tokenCreatedAt(version: number, token: TokenDto): BoardEvent {
  return { type: 'tokenCreated', payload: { ...VHARN_GRID, version, at: AT, token } };
}

/** `token:updated` of `token` at VHARN, as a board event. */
export function tokenUpdatedAt(version: number, token: TokenDto): BoardEvent {
  return { type: 'tokenUpdated', payload: { ...VHARN_GRID, version, at: AT, token } };
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
    payload: { ...VHARN_GRID, version, at: AT, tokenId, col, row },
  };
}

/** `token:deleted` of `tokenId` at VHARN, as a board event. */
export function tokenDeletedAt(version: number, tokenId = LYRA_ID): BoardEvent {
  return {
    type: 'tokenDeleted',
    payload: { ...VHARN_GRID, version, at: AT, tokenId, combat: null },
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

/** `token:veiledLightsChanged` on the group grid of Vharn: the whole list of the lights of the
 *  hidden tokens this viewer does not receive (no version: it replaces the list).
 *
 *  Example: `transport.serverEmits('token:veiledLightsChanged', veiledLightsChanged([veiledTorch()]))` */
export function veiledLightsChanged(
  lights: VeiledLightDto[],
  overrides: Partial<VeiledLightsChangedDto> = {},
): VeiledLightsChangedDto {
  return { campaignId: VHARN.id, sceneId: VHARN_SCENE.id, at: AT, lights, ...overrides };
}

/** Bia's ping on the group grid of Vharn, at (5.5, 2.2) cells.
 *
 *  Example: `transport.serverEmits('board:pinged', boardPinged({ sceneId: TORRE_SCENE.id }))` */
export function boardPinged(overrides: Partial<BoardPingedDto> = {}): BoardPingedDto {
  const where = { sceneId: VHARN_SCENE.id, x: 5.5, y: 2.2 };
  return { campaignId: VHARN.id, userId: BIA_AT_TABLE.userId, at: AT, ...where, ...overrides };
}

export const KAEL_COMBATANT = 'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c';
export const LYRA_COMBATANT = 'c2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d';

/** A combat entry holding one token and no name, as the tracker had before groups.
 *
 *  Example: `soloCombatant(KAEL_COMBATANT, 'kael-token', 18, 0)` */
export function soloCombatant(
  id: string,
  tokenId: string,
  initiative: number | null,
  tieOrder: number,
): CombatantDto {
  return { id, name: null, tokenIds: [tokenId], initiative, tieOrder };
}

/** A combat at VHARN: round 1, Kael (18) on turn, then Lyra (14).
 *
 *  Example: `vharnCombat({ round: 3 })` */
export function vharnCombat(overrides: Partial<CombatDto> = {}): CombatDto {
  return {
    id: 'c3c4d5e6-f7a8-4b9c-8d1e-2f3a4b5c6d7e',
    round: 1,
    currentCombatantId: KAEL_COMBATANT,
    combatants: [
      soloCombatant(KAEL_COMBATANT, 'kael-token', 18, 0),
      soloCombatant(LYRA_COMBATANT, LYRA_ID, 14, 1),
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
    color: null,
    look: null,
    description: '',
    maxStacks: null,
    stacks: 1,
    remainingRounds: 2,
    ...overrides,
  };
}

/** Envenenado on the table's list: the definition `activeCondition()` points at, unless
 *  overridden.
 *
 *  Example: `conditionDefinition({ description: 'Desvantagem em ataques.' })` */
export function conditionDefinition(
  overrides: Partial<ConditionDefinitionDto> = {},
): ConditionDefinitionDto {
  return {
    id: activeCondition().conditionId,
    name: 'Envenenado',
    tone: 'harm',
    icon: 'flask-conical',
    color: null,
    look: null,
    description: '',
    maxStacks: null,
    ...overrides,
  };
}

/** Any board event of VHARN's group grid at `version`, built from its type and the fields of its
 *  payload (`sceneId` overrides the grid). */
export function eventAt(version: number, event: DistributiveOmit<BoardEvent>): BoardEvent {
  return {
    ...event,
    payload: { sceneId: VHARN_SCENE.id, ...event.payload, campaignId: VHARN.id, version, at: AT },
  } as BoardEvent;
}

type DistributiveOmit<E> = E extends { type: infer T; payload: infer P }
  ? {
      type: T;
      payload: Omit<P, 'campaignId' | 'sceneId' | 'version' | 'at'> & { sceneId?: string };
    }
  : never;

/** The card of Bia on VHARN, empty unless overridden.
 *
 *  Example: `memberCard({ armorClass: 15 })` */
export function memberCard(overrides: Partial<MemberCardDto> = {}): MemberCardDto {
  return {
    userId: BIA_AT_TABLE.userId,
    characterName: null,
    armorClass: null,
    difficultyClass: null,
    noteOne: null,
    noteTwo: null,
    ...overrides,
  };
}
