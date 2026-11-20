import { describe, expect, it } from 'vitest';
import type { TokenRow } from '../../../src/modules/tokens/tokens.dao';
import {
  changeVeilOf,
  creationCutsOf,
  hiddenCutsOf,
  seersCutsOf,
  veiledLightsCutsOf,
} from '../../../src/modules/tokens/token-hidden.mapper';
import { seenVeil, veilOf } from '../../../src/modules/tokens/token-veil.mapper';
import { toTokenDto } from '../../../src/modules/tokens/tokens.mapper';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import {
  BRAM_ID,
  LOBO_ID,
  SOMBRA_ID,
  bramRow,
  loboRow,
  sombraRow,
} from '../../support/tokens-factories';

const BASE = {
  campaignId: VHARN_ID,
  sceneId: VHARN_SCENE_ID,
  version: 8,
  at: '2026-10-24T21:00:00.000Z',
};
const MASTERS = { kind: 'masters' } as const;
const BIA = { kind: 'controller', userId: BIA_ID } as const;
const CAIO = { kind: 'controller', userId: CAIO_ID } as const;

function audiencesOf(row: TokenRow) {
  return {
    controllerIds: row.controllerIds,
    privileged: toTokenDto(row, 'privileged'),
    others: toTokenDto(row, 'others'),
  };
}

function idsOfCut(event: { tokens: { id: string; canControl: boolean }[] } | null) {
  return event?.tokens.map(({ id, canControl }) => [id, canControl]);
}

describe('a paste cut by the veil', () => {
  const creation = {
    ...BASE,
    tokens: [audiencesOf(loboRow()), audiencesOf(bramRow())],
    combat: null,
  };

  it('without a hidden token there is no cut: the adapter mixes as always', () => {
    const visible = { ...creation, tokens: [audiencesOf(bramRow())] };

    expect(creationCutsOf(visible, veilOf([bramRow()]))).toEqual([]);
  });

  it('a pasted hidden Lobo (Bia) with the Bram (Caio): each gets its mix without what it may not see', () => {
    const cuts = creationCutsOf(creation, veilOf([loboRow(), bramRow()]));

    expect(cuts.map(({ audience, event }) => [audience, idsOfCut(event)])).toEqual([
      [
        MASTERS,
        [
          [LOBO_ID, true],
          [BRAM_ID, true],
        ],
      ],
      [
        BIA,
        [
          [LOBO_ID, true],
          [BRAM_ID, false],
        ],
      ],
      [CAIO, [[BRAM_ID, true]]],
      [{ kind: 'rest', controllerIds: [BIA_ID, CAIO_ID] }, [[BRAM_ID, false]]],
    ]);
  });

  it('a paste of only the hidden Lobo, without combat, is nothing for the rest', () => {
    const lonely = { ...creation, tokens: [audiencesOf(loboRow())] };

    expect(creationCutsOf(lonely, veilOf([loboRow()])).at(-1)?.event).toBeNull();
  });
});

describe('a token change of a hidden token', () => {
  const lobo = toTokenDto(loboRow(), 'privileged');
  const change = {
    name: 'token:updated' as const,
    campaignId: VHARN_ID,
    sceneId: VHARN_SCENE_ID,
    controllerIds: [CAIO_ID],
    privileged: { ...BASE, token: lobo },
    others: { ...BASE, token: toTokenDto(loboRow(), 'others') },
  };
  const scene = { veil: veilOf([loboRow({ controllerIds: [CAIO_ID] })]), combat: null };

  it('a visible token has no veil', () => {
    expect(changeVeilOf(change, false, [BIA_ID], scene)).toEqual({ cuts: [], lost: [] });
  });

  it('the whole token to the masters and Caio (who gained it), nothing to the rest, token:deleted to Bia', () => {
    const veil = changeVeilOf(change, true, [BIA_ID], scene);

    expect(veil.cuts).toEqual([
      { audience: MASTERS, event: change.privileged },
      { audience: CAIO, event: change.privileged },
      { audience: { kind: 'rest', controllerIds: [CAIO_ID, BIA_ID] }, event: null },
    ]);
    expect(veil.lost).toEqual([
      { userId: BIA_ID, event: { ...BASE, tokenId: LOBO_ID, combat: null } },
    ]);
  });
});

describe('a token change of a hidden token seen by magic sight', () => {
  const change = {
    name: 'token:updated' as const,
    campaignId: VHARN_ID,
    sceneId: VHARN_SCENE_ID,
    controllerIds: [CAIO_ID],
    privileged: { ...BASE, token: toTokenDto(loboRow(), 'privileged') },
    others: { ...BASE, token: toTokenDto(loboRow(), 'others') },
  };

  it('the seer Bia gets it redacted as others; the rest leaves her out', () => {
    const veil = seenVeil(veilOf([loboRow({ controllerIds: [CAIO_ID] })]), [BIA_ID]);

    const cut = changeVeilOf(change, true, [], { veil, combat: null });

    expect(cut.cuts).toEqual([
      { audience: MASTERS, event: change.privileged },
      { audience: CAIO, event: change.privileged },
      { audience: { kind: 'seer', userId: BIA_ID }, event: change.others },
      { audience: { kind: 'rest', controllerIds: [CAIO_ID, BIA_ID] }, event: null },
    ]);
  });

  it('Bia, who stopped controlling it but sees by magic sight, gets it as others, not token:deleted', () => {
    const veil = seenVeil(veilOf([loboRow({ controllerIds: [CAIO_ID] })]), [BIA_ID]);

    const cut = changeVeilOf(change, true, [BIA_ID], { veil, combat: null });

    expect(cut.lost).toEqual([]);
    expect(cut.cuts.find(({ audience }) => audience.kind === 'seer')?.event).toBe(change.others);
  });
});

describe('the seers of a grid that change', () => {
  const hidden = [audiencesOf(loboRow()), audiencesOf(sombraRow())];
  const shapeOf = (cuts: ReturnType<typeof seersCutsOf>) =>
    cuts.map((cut) => [
      cut.userId,
      cut.name,
      cut.name === 'token:createdMany'
        ? cut.event.tokens.map(({ id, canControl }) => [id, canControl])
        : cut.event.tokenIds,
    ]);

  it('Caio starting to see gets token:createdMany with both hidden ones as others', () => {
    const veil = seenVeil(veilOf([loboRow(), sombraRow()]), [CAIO_ID]);

    const cuts = seersCutsOf(BASE, { gained: [CAIO_ID], lost: [], hidden, veil, combat: null });

    expect(shapeOf(cuts)).toEqual([
      [
        CAIO_ID,
        'token:createdMany',
        [
          [LOBO_ID, false],
          [SOMBRA_ID, false],
        ],
      ],
    ]);
  });

  it('Bia stopping to see loses only the Sombra: the Lobo is hers', () => {
    const veil = veilOf([loboRow(), sombraRow()]);

    const cuts = seersCutsOf(BASE, { gained: [], lost: [BIA_ID], hidden, veil, combat: null });

    expect(shapeOf(cuts)).toEqual([[BIA_ID, 'token:deletedMany', [SOMBRA_ID]]]);
  });

  it('nobody changing, or nothing to receive, cuts nothing', () => {
    const veil = veilOf([loboRow()]);
    const onlyHers = [audiencesOf(loboRow())];

    expect(seersCutsOf(BASE, { gained: [], lost: [], hidden, veil, combat: null })).toEqual([]);
    expect(
      seersCutsOf(BASE, { gained: [BIA_ID], lost: [], hidden: onlyHers, veil, combat: null }),
    ).toEqual([]);
  });
});

describe('hiding and showing', () => {
  it('hiding the Lobo with the seer Caio: Caio keeps seeing it and gets the flag, not token:deletedMany', () => {
    const after = seenVeil(veilOf([loboRow(), sombraRow()]), [CAIO_ID]);
    const before = seenVeil(veilOf([sombraRow()]), [CAIO_ID]);

    const cuts = hiddenCutsOf(BASE, [audiencesOf(loboRow())], true, {
      before,
      after,
      combat: null,
    });

    const caio = cuts.find(({ audience }) => 'userId' in audience && audience.userId === CAIO_ID);
    expect([caio?.audience.kind, caio?.name]).toEqual(['seer', 'token:hiddenChanged']);
  });

  const after = veilOf([loboRow(), sombraRow()]);
  const before = veilOf([sombraRow()]);
  const changed = [audiencesOf(loboRow())];

  it('hiding the Lobo: the flag to the masters and Bia, token:deletedMany to the rest', () => {
    const cuts = hiddenCutsOf(BASE, changed, true, { before, after, combat: null });

    expect(
      cuts.map(({ audience, name, event }) => [
        audience.kind,
        name,
        'tokenIds' in event ? event.tokenIds : null,
      ]),
    ).toEqual([
      ['masters', 'token:hiddenChanged', [LOBO_ID]],
      ['controller', 'token:hiddenChanged', [LOBO_ID]],
      ['rest', 'token:deletedMany', [LOBO_ID]],
    ]);
  });

  it('showing the Lobo: the flag to the masters and Bia, token:createdMany redacted to the rest', () => {
    const shown = [audiencesOf(loboRow({ token: { ...loboRow().token, hidden: false } }))];

    const cuts = hiddenCutsOf(BASE, shown, false, { before: after, after: before, combat: null });

    const rest = cuts.at(-1);
    expect(cuts.map(({ name }) => name)).toEqual([
      'token:hiddenChanged',
      'token:hiddenChanged',
      'token:createdMany',
    ]);
    expect(
      rest?.name === 'token:createdMany' && rest.event.tokens.map(({ canControl }) => canControl),
    ).toEqual([false]);
  });
});

describe('the veiled lights of each audience', () => {
  it('moving the lit Lobo (Bia): the rest gets its torch, Bia and the masters get nothing', () => {
    const after = veilOf([loboRow(), sombraRow()]);

    const cuts = veiledLightsCutsOf(after, veilOf([loboRow()]).tokens);

    expect(cuts).toEqual([
      {
        audience: { kind: 'rest', controllerIds: [BIA_ID] },
        lights: [{ x: 4, y: 5, bright: 4, dim: 4, color: 'torch', facing: 0, angle: 360 }],
      },
    ]);
  });

  it('showing the Lobo: the rest gets its list without the torch', () => {
    const cuts = veiledLightsCutsOf(veilOf([sombraRow()]), veilOf([loboRow()]).tokens);

    expect(cuts).toEqual([{ audience: { kind: 'rest', controllerIds: [BIA_ID] }, lights: [] }]);
  });
});
