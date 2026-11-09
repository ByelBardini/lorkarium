import { wall } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  controlOfDragged,
  movedRowsOf,
  requireDrags,
  requirePassages,
  tokenRulesOf,
} from '../../../src/modules/tokens/token-group-moves';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { scenePo } from '../../support/scenes-factories';
import { LYRA_ID, lyraPo, lyraRow } from '../../support/tokens-factories';

const LIMITS = { barLimit: 99_999, tokenLimit: 500, blockerLimit: 50 };
const caio = new CampaignAccessBo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' });
const ana = new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });
const SCENE = { ...scenePo({ widthCells: 10, heightCells: 10 }), isActive: true };

function dragged(controllerIds: readonly string[]) {
  const { id, layer, width, height, hidden } = lyraPo();
  return [{ token: { id, layer, width, height, hidden }, controllerIds }];
}

describe('tokenRulesOf', () => {
  it('the rule of the scene size: a cell outside it is refused citing the token', () => {
    const rules = tokenRulesOf(SCENE, [], LIMITS);

    expect(() => rules.place({ col: 12, row: 0 }, lyraPo())).toThrow(/10/);
  });
});

describe('requireDrags', () => {
  it('Caio dragging the Lyra of Bia is FORBIDDEN; the master drags it', () => {
    const drags = [{ tokenId: LYRA_ID, cell: null }];

    expect(() => requireDrags(caio, SCENE, dragged([BIA_ID]), drags, LIMITS)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
    expect(() => requireDrags(ana, SCENE, dragged([BIA_ID]), drags, LIMITS)).not.toThrow();
  });

  it('a token the query did not find (another table) is TOKEN_NOT_FOUND', () => {
    const drags = [{ tokenId: 'quelm-token', cell: null }];

    expect(() => requireDrags(ana, SCENE, dragged([]), drags, LIMITS)).toThrow(
      expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }),
    );
  });
});

describe('requirePassages', () => {
  const LINE = wall({
    kind: 'wall',
    shape: 'line',
    x: 0,
    y: 9,
    width: 1,
    height: 0,
    points: [
      [0, 0],
      [1, 0],
    ],
    doorState: null,
  });
  const walls = Array.from({ length: 4000 }, () => LINE);
  const sceneWalls = {
    wallsOf: async () => ({ walls, placed: walls.map((each) => ({ id: 'line', wall: each })) }),
  };
  const locked = { daos: {}, scene: SCENE } as unknown as Parameters<typeof requirePassages>[0];
  const master = new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });
  const biaAccess = new CampaignAccessBo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' });
  const row = lyraRow({ token: lyraPo({ col: 1, row: 1 }), controllerIds: [BIA_ID] });
  const passage = (bends: number) => ({
    row,
    path: Array.from({ length: bends }, (_, at) => ({ col: 1 + (at % 2), row: 1 })),
    to: { col: 2, row: 1 },
  });
  const deps = { walls: sceneWalls, limits: LIMITS };

  it('exactly the budget in legs × segments still walks', async () => {
    await expect(requirePassages(locked, biaAccess, [passage(249)], deps)).resolves.toBeUndefined();
  });

  it('one leg more is WALL_CHECKS_EXCEEDED, before any wall is tested', async () => {
    await expect(requirePassages(locked, biaAccess, [passage(250)], deps)).rejects.toMatchObject({
      code: 'WALL_CHECKS_EXCEEDED',
    });
  });

  it('adds up the legs of the whole group', async () => {
    const group = [passage(124), passage(125)];

    await expect(requirePassages(locked, biaAccess, group, deps)).rejects.toMatchObject({
      code: 'WALL_CHECKS_EXCEEDED',
    });
  });

  it('the master passes every wall, so nothing is counted', async () => {
    await expect(requirePassages(locked, master, [passage(250)], deps)).resolves.toBeUndefined();
  });
});

describe('movedRowsOf and controlOfDragged', () => {
  it('the rows stand where the moves left them; a token not moved stays', () => {
    const other = lyraRow({ token: lyraPo({ id: 'kael', col: 1, row: 1 }) });

    const moved = movedRowsOf([lyraRow(), other], [{ tokenId: LYRA_ID, col: 7, row: 8 }]);

    expect(moved.map(({ token }) => [token.col, token.row])).toEqual([
      [7, 8],
      [1, 1],
    ]);
  });

  it('who controls a dragged token, as the veil reads it', () => {
    const [first] = dragged([BIA_ID]);
    if (!first) throw new Error('no dragged token');

    expect(controlOfDragged(first)).toEqual({
      tokenId: LYRA_ID,
      controllerIds: [BIA_ID],
      hidden: false,
    });
  });
});
