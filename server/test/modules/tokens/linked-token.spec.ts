import { describe, expect, it } from 'vitest';
import {
  composedTokenRow,
  identityOf,
  splitStyle,
  splitUpdate,
  stateHolderIdOf,
} from '../../../src/modules/tokens/linked-token';
import { toTokenDto } from '../../../src/modules/tokens/tokens.mapper';
import { BIA_ID } from '../../support/campaigns-factories';
import {
  ESTRADA_LYRA_ID,
  LYRA_ANCHOR_ID,
  lyraAnchorRow,
  linkedLyraRow,
} from '../../support/character-fakes';
import {
  FIRE_AURA,
  LYRA_WOLF_FORM_ID,
  fireAuraColumns,
  lyraForms,
  lyraPo,
  lyraRow,
} from '../../support/tokens-factories';

function anchorWithLook() {
  const anchor = lyraAnchorRow();
  const look = {
    name: 'Lyra Vento',
    initials: 'LV',
    side: 'neutral' as const,
    imageAssetId: 'portrait',
    frame: 'round' as const,
    defeated: true,
  };
  return { ...anchor, token: { ...anchor.token, ...look } };
}

describe('a token linked to a character', () => {
  it('shows the name, initials, side, image, frame, defeat mark, bars and controllers of the anchor', () => {
    const composed = composedTokenRow(linkedLyraRow(), anchorWithLook());

    expect(composed.token).toMatchObject({
      name: 'Lyra Vento',
      initials: 'LV',
      side: 'neutral',
      imageAssetId: 'portrait',
      frame: 'round',
      defeated: true,
    });
    expect(composed.bars.map(({ id }) => id)).toEqual([
      `${LYRA_ANCHOR_ID}-pv`,
      `${LYRA_ANCHOR_ID}-insp`,
    ]);
    expect(composed.controllerIds).toEqual([BIA_ID]);
  });

  it('keeps its own place, size, layer, facing, flips, sight and light', () => {
    const own = linkedLyraRow({
      width: 2,
      height: 2,
      layer: 'objects',
      facing: 90,
      flipX: true,
      sightBright: '6.00',
      sightDim: '0.00',
      lightBright: '4.00',
      lightDim: '4.00',
      lightLit: false,
    });

    const { token } = composedTokenRow(own, anchorWithLook());

    expect(token).toMatchObject({
      id: ESTRADA_LYRA_ID,
      col: 8,
      row: 2,
      width: 2,
      height: 2,
      layer: 'objects',
      facing: 90,
      flipX: true,
      sightBright: '6.00',
      lightBright: '4.00',
      lightLit: false,
      anchorTokenId: LYRA_ANCHOR_ID,
    });
  });

  it('the DTO names its anchor, and an unlinked token passes as it is with a null anchor', () => {
    const dto = toTokenDto(composedTokenRow(linkedLyraRow(), lyraAnchorRow()), 'privileged');
    expect(dto.anchorTokenId).toBe(LYRA_ANCHOR_ID);
    expect(composedTokenRow(lyraRow(), undefined)).toEqual(lyraRow());
    expect(toTokenDto(lyraRow(), 'others').anchorTokenId).toBeNull();
  });

  it('holds its shared state in the anchor: conditions are read by the anchor id', () => {
    expect(stateHolderIdOf(linkedLyraRow())).toBe(LYRA_ANCHOR_ID);
    expect(stateHolderIdOf(lyraRow())).toBe(lyraRow().token.id);
  });
});

describe('the aura of a token linked to a character', () => {
  it('belongs to the anchor: identityOf carries the seven aura columns', () => {
    expect(identityOf(lyraPo(fireAuraColumns()))).toMatchObject(fireAuraColumns());
  });

  it('a linked token shows the aura of its anchor, not its own', () => {
    const anchor = lyraAnchorRow();
    const withAura = { ...anchor, token: { ...anchor.token, ...fireAuraColumns() } };

    expect(composedTokenRow(linkedLyraRow(), withAura).token).toMatchObject(fireAuraColumns());
  });

  it('splitStyle puts the aura in the shared part and the flip in its own', () => {
    expect(splitStyle({ aura: FIRE_AURA, flipX: true })).toEqual({
      shared: { aura: FIRE_AURA },
      own: { flipX: true },
    });
  });

  it('splitStyle keeps aura null in the shared part: taking it away is the anchor too', () => {
    expect(splitStyle({ aura: null }).shared).toEqual({ aura: null });
  });

  it('splitUpdate sends the aura columns to the anchor; only the size stays on the token', () => {
    const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 } as const;
    const update = { fields: { ...fields, ...fireAuraColumns() }, bars: [], controllerIds: [] };

    const { anchor, own } = splitUpdate(update, { width: 1, height: 1 });

    expect(anchor.fields).toMatchObject(fireAuraColumns());
    expect(own).toEqual({ width: 1, height: 1 });
  });

  it('splitUpdate sends the shape of a round image aura to the anchor, never to the token', () => {
    const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 } as const;
    const round = fireAuraColumns({ auraKind: 'image', auraEffect: null, auraImageShape: 'round' });
    const update = { fields: { ...fields, ...round }, bars: [], controllerIds: [] };

    const { anchor, own } = splitUpdate(update, { width: 1, height: 1 });

    expect(anchor.fields).toMatchObject({ auraImageShape: 'round' });
    expect(own).not.toHaveProperty('auraImageShape');
  });

  it('identityOf carries the shape of a round image aura', () => {
    const round = fireAuraColumns({ auraKind: 'image', auraEffect: null, auraImageShape: 'round' });

    expect(identityOf(lyraPo(round))).toMatchObject({ auraImageShape: 'round' });
  });
});

describe('the forms of a token linked to a character', () => {
  function anchorInWolf() {
    const anchor = lyraAnchorRow();
    const forms = lyraForms().map((form) => ({ ...form, tokenId: LYRA_ANCHOR_ID }));
    return { ...anchor, token: { ...anchor.token, activeFormId: LYRA_WOLF_FORM_ID }, forms };
  }

  it('shows the forms and the shown form of its anchor, not its own', () => {
    const own = linkedLyraRow({ activeFormId: null });

    const composed = composedTokenRow({ ...own, forms: [] }, anchorInWolf());

    expect(composed.forms.map(({ name }) => name)).toEqual(['Elfa', 'Lobo atroz', 'Corvo']);
    expect(composed.token.activeFormId).toBe(LYRA_WOLF_FORM_ID);
    expect(toTokenDto(composed, 'privileged').forms).toHaveLength(3);
  });

  it('identityOf leaves the shown form out: an unlinked copy must not point at the anchor form', () => {
    expect(identityOf(anchorInWolf().token)).not.toHaveProperty('activeFormId');
  });

  it('splitUpdate sends the forms and the shown form to the anchor, never to the token', () => {
    const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 2, height: 2 } as const;
    const forms = lyraForms();
    const update = {
      fields: { ...fields, activeFormId: null },
      bars: [],
      controllerIds: [],
      forms,
    };

    const { anchor, own } = splitUpdate(update, { width: 1, height: 1 });

    expect(anchor.forms).toBe(forms);
    expect(anchor.fields).toMatchObject({ activeFormId: null, width: 1 });
    expect(own).toEqual({ width: 2, height: 2 });
  });
});
