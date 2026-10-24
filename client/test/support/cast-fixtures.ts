import type { BoardStateDto, SceneDto, TokenDto } from '@lorkarium/contracts';
import type { BoardEvent } from '@/services/board-events';
import { VHARN } from './campaigns-api-fake';
import { LYRA_ID, VHARN_SCENE, eventAt, lyra, vharnBoard } from './table-session-fixtures';

/** The id of VHARN's cast (the hidden scene of the anchors), as `detailOf(VHARN)` gives it. */
export const VHARN_CAST_ID = '8e4d3c2b-1a0f-4e9d-a8b7-6f5e4d3c2b1a';

export const CAST_SCENE: SceneDto = { ...VHARN_SCENE, id: VHARN_CAST_ID, name: 'Elenco' };

export const LYRA_ANCHOR_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

/** The anchor of Bia's character in the cast: Lyra with PV 25/45 and Inspiração 1/1. */
export function lyraAnchor(overrides: Partial<TokenDto> = {}): TokenDto {
  const [pv, inspiration] = lyra().bars;
  if (!pv || !inspiration) throw new Error('lyra() lost its PV and Inspiração bars');
  return lyra({
    id: LYRA_ANCHOR_ID,
    col: 0,
    row: 0,
    bars: [{ ...pv, id: 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b', current: 25 }, inspiration],
    ...overrides,
  });
}

/** Lyra on a grid, linked to Bia's card: as the grid's snapshot came (PV 32/45). */
export function linkedLyra(overrides: Partial<TokenDto> = {}): TokenDto {
  return lyra({ id: LYRA_ID, anchorTokenId: LYRA_ANCHOR_ID, ...overrides });
}

/** VHARN's cast as Ana sees it at version 3: Lyra's anchor. */
export function castBoard(overrides: Partial<BoardStateDto> = {}): BoardStateDto {
  return vharnBoard({
    campaignId: VHARN.id,
    version: 3,
    scene: CAST_SCENE,
    tokens: [lyraAnchor()],
    ...overrides,
  });
}

/** The scope of an event of VHARN's cast. */
export const VHARN_CAST = { campaignId: VHARN.id, sceneId: VHARN_CAST_ID } as const;

/** `token:updated` of Lyra's anchor in the cast at `version`, its PV at `pv`.
 *
 *  Example: `anchorUpdatedAt(4, 18)` */
export function anchorUpdatedAt(version: number, pv: number): BoardEvent {
  const anchor = lyraAnchor();
  const bars = anchor.bars.map((bar, index) => (index === 0 ? { ...bar, current: pv } : bar));
  const token = { ...anchor, bars };
  return eventAt(version, { type: 'tokenUpdated', payload: { token, sceneId: VHARN_CAST_ID } });
}
