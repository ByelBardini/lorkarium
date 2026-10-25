import type { TokensMovedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  cutsOf,
  entriesSeenBy,
  joinedVeil,
  tokenIdsSeenBy,
  tokenSeenBy,
  veilCutsOf,
  veilOf,
  veiledLightsOf,
} from '../../../src/modules/tokens/token-veil.mapper';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import {
  BRAM_ID,
  LOBO_ID,
  LYRA_ID,
  SOMBRA_ID,
  bramRow,
  loboRow,
  lyraPo,
  lyraRow,
  sombraRow,
} from '../../support/tokens-factories';

const BASE = {
  campaignId: VHARN_ID,
  sceneId: VHARN_SCENE_ID,
  version: 8,
  at: '2026-10-24T21:00:00.000Z',
};
const LOBO_ALONE = veilOf([loboRow({ controllerIds: [] })]);

function invisibleOf(veil: ReturnType<typeof veilOf>, kind: string, userId?: string): string[] {
  const cut = veilCutsOf(veil).find(
    ({ audience }) =>
      audience.kind === kind && (!userId || ('userId' in audience && audience.userId === userId)),
  );
  return [...(cut?.invisible ?? [])].sort();
}

describe('the veil of the hidden tokens', () => {
  it('only the hidden rows enter the veil', () => {
    expect(veilOf([lyraRow(), loboRow(), bramRow()]).tokens.map(({ tokenId }) => tokenId)).toEqual([
      LOBO_ID,
    ]);
  });

  it('an empty veil cuts nothing: no audience, the event goes whole as before', () => {
    expect(veilCutsOf(veilOf([lyraRow()]))).toEqual([]);
    expect(cutsOf({ ...BASE, tokenId: LYRA_ID, col: 1, row: 1 }, veilOf([]), tokenSeenBy)).toEqual(
      [],
    );
  });

  it('the Lobo hidden with no controller: the masters see all, the rest has the Lobo invisible', () => {
    expect(veilCutsOf(LOBO_ALONE).map(({ audience }) => audience.kind)).toEqual([
      'masters',
      'rest',
    ]);
    expect(invisibleOf(LOBO_ALONE, 'masters')).toEqual([]);
    expect(invisibleOf(LOBO_ALONE, 'rest')).toEqual([LOBO_ID]);
  });

  it('the Lobo of Bia and the Sombra: Bia loses only the Sombra, the rest both, and the rest skips Bia', () => {
    const veil = veilOf([loboRow(), sombraRow()]);

    expect(invisibleOf(veil, 'controller', BIA_ID)).toEqual([SOMBRA_ID]);
    expect(invisibleOf(veil, 'rest')).toEqual([LOBO_ID, SOMBRA_ID].sort());
    expect(veilCutsOf(veil).at(-1)?.audience).toEqual({ kind: 'rest', controllerIds: [BIA_ID] });
  });

  it('a user given in alsoUserIds gets a cut of their own, seeing none of the hidden', () => {
    const cuts = veilCutsOf(LOBO_ALONE, [CAIO_ID]);

    const caio = cuts.find(({ audience }) => audience.kind === 'controller');
    expect(caio?.audience).toEqual({ kind: 'controller', userId: CAIO_ID });
    expect([...(caio?.invisible ?? [])]).toEqual([LOBO_ID]);
    expect(cuts.at(-1)?.audience).toEqual({ kind: 'rest', controllerIds: [CAIO_ID] });
  });

  it('joinedVeil keeps each token once', () => {
    const joined = joinedVeil(veilOf([loboRow()]), veilOf([loboRow(), sombraRow()]));

    expect(joined.tokens.map(({ tokenId }) => tokenId)).toEqual([LOBO_ID, SOMBRA_ID]);
  });
});

describe('what each audience receives of an event', () => {
  const invisible = new Set([LOBO_ID]);

  it('token:movedMany of the Lobo and the Kael (Bram) reaches the rest with only the Kael', () => {
    const moves = [
      { tokenId: LOBO_ID, col: 1, row: 1 },
      { tokenId: BRAM_ID, col: 2, row: 2 },
    ];
    const seen = entriesSeenBy<TokensMovedDto>('moves')({ ...BASE, moves }, invisible);

    expect(seen?.moves).toEqual([{ tokenId: BRAM_ID, col: 2, row: 2 }]);
  });

  it.each(['faces', 'resizes', 'drags', 'applied'] as const)(
    'the %s of a batch lose the entries of the invisible tokens',
    (key) => {
      const entries = [{ tokenId: LOBO_ID }, { tokenId: BRAM_ID }];
      const seen = entriesSeenBy<Record<typeof key, { tokenId: string }[]>>(key)(
        { [key]: entries } as Record<typeof key, { tokenId: string }[]>,
        invisible,
      );

      expect(seen?.[key]).toEqual([{ tokenId: BRAM_ID }]);
    },
  );

  it('a batch left empty is null (the publisher sends board:advanced)', () => {
    const moves = [{ tokenId: LOBO_ID, col: 1, row: 1 }];

    expect(entriesSeenBy<TokensMovedDto>('moves')({ ...BASE, moves }, invisible)).toBeNull();
  });

  it('the tokenIds of a layer change lose the Lobo, and only the Lobo leaves null', () => {
    const layer = { ...BASE, tokenIds: [LOBO_ID, BRAM_ID], layer: 'objects' as const };

    expect(tokenIdsSeenBy(layer, invisible)?.tokenIds).toEqual([BRAM_ID]);
    expect(tokenIdsSeenBy({ ...layer, tokenIds: [LOBO_ID] }, invisible)).toBeNull();
  });

  it.each([
    ['token:moved', { tokenId: LOBO_ID, col: 1, row: 1 }],
    ['condition:applied', { tokenId: LOBO_ID }],
    ['token:mainChanged', { tokenId: LOBO_ID, userId: BIA_ID }],
  ])('%s of the Lobo alone is null for who does not see it', (_name, fields) => {
    expect(tokenSeenBy({ ...BASE, ...fields }, invisible)).toBeNull();
    expect(tokenSeenBy({ ...BASE, ...fields }, new Set([SOMBRA_ID]))).toEqual({
      ...BASE,
      ...fields,
    });
  });

  it('cutsOf gives the masters the event whole, Bia hers and the rest null', () => {
    const event = { ...BASE, tokenId: LOBO_ID, col: 1, row: 1 };

    const cuts = cutsOf(event, veilOf([loboRow()]), tokenSeenBy);

    expect(cuts.map(({ audience, event: seen }) => [audience.kind, seen])).toEqual([
      ['masters', event],
      ['controller', event],
      ['rest', null],
    ]);
  });
});

describe('the veiled lights', () => {
  it('the lit torch of the Lobo (2×2 at (3, 4)) shines from (4, 5)', () => {
    const veil = veilOf([loboRow()]);

    expect(veiledLightsOf(veil, new Set([LOBO_ID]))).toEqual([
      { x: 4, y: 5, bright: 4, dim: 4, color: 'torch', facing: 0, angle: 360 },
    ]);
  });

  it('a light that is out, no light at all, or a token the audience sees give no veiled light', () => {
    const out = loboRow({ token: { ...loboRow().token, lightLit: false } });
    const veil = veilOf([out, sombraRow()]);

    expect(veiledLightsOf(veil, new Set([LOBO_ID, SOMBRA_ID]))).toEqual([]);
    expect(veiledLightsOf(veilOf([loboRow()]), new Set())).toEqual([]);
  });

  it('the veil of a token without hidden keeps no light of it', () => {
    expect(
      veilOf([lyraRow({ token: lyraPo({ lightBright: '4.00', lightDim: '4.00' }) })]).tokens,
    ).toEqual([]);
  });
});
