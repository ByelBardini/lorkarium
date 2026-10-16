import type { TokenRow } from '../../src/modules/tokens/tokens.dao';
import type { TokenBarPo, TokenPo } from '../../src/modules/tokens/tokens.po';
import { BIA_ID } from './campaigns-factories';
import { VHARN_SCENE_ID } from './scenes-factories';

export const LYRA_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
export const LYRA_PV_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const LYRA_INSPIRATION_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

const CREATED = new Date('2026-10-15T12:00:00Z');

/** Lyra, Bia's ally on the VHARN scene, at (3, 4). */
export function lyraPo(overrides: Partial<TokenPo> = {}): TokenPo {
  return {
    id: LYRA_ID,
    sceneId: VHARN_SCENE_ID,
    name: 'Lyra',
    initials: 'LY',
    side: 'ally',
    size: 1,
    col: 3,
    row: 4,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

/** A bar of Lyra; `pvBar()` is the hidden 32/45 PV at position 0. */
export function pvBar(overrides: Partial<TokenBarPo> = {}): TokenBarPo {
  return {
    id: LYRA_PV_ID,
    tokenId: LYRA_ID,
    position: 0,
    label: 'PV',
    current: 32,
    max: 45,
    color: 'ember',
    visibility: 'controllers',
    ...overrides,
  };
}

/** Lyra's visible Inspiração at position 1. */
export function inspirationBar(overrides: Partial<TokenBarPo> = {}): TokenBarPo {
  return pvBar({
    id: LYRA_INSPIRATION_ID,
    position: 1,
    label: 'Inspiração',
    current: 1,
    max: 1,
    color: 'gold',
    visibility: 'everyone',
    ...overrides,
  });
}

/** Lyra with both bars, controlled by Bia.
 *
 *  Example: `lyraRow({ controllerIds: [] })` */
export function lyraRow(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    token: lyraPo(),
    bars: [pvBar(), inspirationBar()],
    controllerIds: [BIA_ID],
    ...overrides,
  };
}
