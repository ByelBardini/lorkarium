import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  controlOfDragged,
  movedRowsOf,
  requireDrags,
  tokenRulesOf,
} from '../../../src/modules/tokens/token-group-moves';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { scenePo } from '../../support/scenes-factories';
import { LYRA_ID, lyraPo, lyraRow } from '../../support/tokens-factories';

const LIMITS = { barLimit: 99_999, tokenLimit: 500 };
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
