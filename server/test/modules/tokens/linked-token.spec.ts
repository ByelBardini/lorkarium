import { describe, expect, it } from 'vitest';
import {
  composedTokenRow,
  identityOf,
  splitStyle,
  splitUpdate,
  stateHolderIdOf,
} from '../../../src/modules/tokens/linked-token';
import { toTokenDto } from '../../../src/modules/tokens/tokens.mapper';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';
import {
  ESTRADA_LYRA_ID,
  LYRA_ANCHOR_ID,
  linkedLyraRow,
  lyraCharacterRow,
} from '../../support/character-fakes';
import { LYRA_CHARACTER_ID, characterPo } from '../../support/characters-factories';
import {
  FIRE_AURA,
  LYRA_WOLF_FORM_ID,
  fireAuraColumns,
  lyraForms,
  lyraPo,
  lyraRow,
} from '../../support/tokens-factories';

function lyraWithLook() {
  const lyra = lyraCharacterRow();
  const look = {
    name: 'Lyra Vento',
    initials: 'LV',
    side: 'neutral' as const,
    imageAssetId: 'portrait',
    frame: 'round' as const,
    defeated: true,
  };
  return { ...lyra, character: { ...lyra.character, ...look } };
}

const FIELDS = { name: 'Lyra', initials: 'LY', side: 'ally', width: 2, height: 2 } as const;

describe('a token linked to a character', () => {
  it('shows the name, initials, side, image, frame, defeat mark, bars and controllers of the character', () => {
    const composed = composedTokenRow(linkedLyraRow(), lyraWithLook());

    expect(composed.token).toMatchObject({
      name: 'Lyra Vento',
      initials: 'LV',
      side: 'neutral',
      imageAssetId: 'portrait',
      frame: 'round',
      defeated: true,
    });
    expect(composed.bars.map(({ id }) => id)).toEqual([
      `${LYRA_CHARACTER_ID}-pv`,
      `${LYRA_CHARACTER_ID}-insp`,
    ]);
    expect(composed.bars.map(({ tokenId }) => tokenId)).toEqual([ESTRADA_LYRA_ID, ESTRADA_LYRA_ID]);
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

    const { token } = composedTokenRow(own, lyraWithLook());

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
      characterId: LYRA_CHARACTER_ID,
    });
  });

  it('wears nothing of a character it is not linked to', () => {
    const other = { ...lyraWithLook(), character: characterPo({ id: 'another-character' }) };

    expect(composedTokenRow(linkedLyraRow(), other)).toEqual(linkedLyraRow());
    expect(composedTokenRow(linkedLyraRow(), undefined)).toEqual(linkedLyraRow());
  });

  it('the DTO names its character and its anchor; an unlinked token has both null', () => {
    const dto = toTokenDto(composedTokenRow(linkedLyraRow(), lyraCharacterRow()), 'privileged');

    expect(dto).toMatchObject({ characterId: LYRA_CHARACTER_ID, anchorTokenId: LYRA_ANCHOR_ID });
    expect(toTokenDto(lyraRow(), 'others')).toMatchObject({
      characterId: null,
      anchorTokenId: null,
    });
  });

  it('the redacted DTO keeps only the character bars seen by everyone, with the control', () => {
    const composed = composedTokenRow(linkedLyraRow(), {
      ...lyraCharacterRow(),
      controllerIds: [BIA_ID, CAIO_ID],
    });

    const dto = toTokenDto(composed, 'others');

    expect(dto.bars.map(({ label }) => label)).toEqual(['Inspiração']);
    expect(dto.controllerIds).toEqual([BIA_ID, CAIO_ID]);
  });

  it('still holds its conditions in the anchor: they are read by the anchor id', () => {
    expect(stateHolderIdOf(linkedLyraRow())).toBe(LYRA_ANCHOR_ID);
    expect(stateHolderIdOf(lyraRow())).toBe(lyraRow().token.id);
  });
});

describe('the aura of a token linked to a character', () => {
  it('belongs to the character: identityOf carries the seven aura columns', () => {
    expect(identityOf(lyraPo(fireAuraColumns()))).toMatchObject(fireAuraColumns());
  });

  it('a linked token shows the aura of its character, not its own', () => {
    const lyra = lyraCharacterRow();
    const withAura = { ...lyra, character: { ...lyra.character, ...fireAuraColumns() } };

    expect(composedTokenRow(linkedLyraRow(), withAura).token).toMatchObject(fireAuraColumns());
  });

  it('splitStyle puts the aura in the shared part and the flip in its own', () => {
    expect(splitStyle({ aura: FIRE_AURA, flipX: true })).toEqual({
      shared: { aura: FIRE_AURA },
      own: { flipX: true },
    });
  });

  it('splitStyle keeps aura null in the shared part: taking it away is the character too', () => {
    expect(splitStyle({ aura: null }).shared).toEqual({ aura: null });
  });

  it('splitUpdate sends the aura columns to the character; the size stays on the token', () => {
    const update = { fields: { ...FIELDS, ...fireAuraColumns() }, bars: [], controllerIds: [] };

    const { shared, own } = splitUpdate(update);

    expect(shared.look).toMatchObject(fireAuraColumns());
    expect(own).toEqual({ fields: { width: 2, height: 2 } });
  });

  it('splitUpdate sends the shape of a round image aura to the character, never to the token', () => {
    const round = fireAuraColumns({ auraKind: 'image', auraEffect: null, auraImageShape: 'round' });
    const update = { fields: { ...FIELDS, ...round }, bars: [], controllerIds: [] };

    const { shared, own } = splitUpdate(update);

    expect(shared.look).toMatchObject({ auraImageShape: 'round' });
    expect(own.fields).not.toHaveProperty('auraImageShape');
  });

  it('identityOf carries the shape of a round image aura', () => {
    const round = fireAuraColumns({ auraKind: 'image', auraEffect: null, auraImageShape: 'round' });

    expect(identityOf(lyraPo(round))).toMatchObject({ auraImageShape: 'round' });
  });
});

describe('a token:update of a token linked to a character, split', () => {
  it('the name, initials, side, image, frame, bars and controllers go to the character', () => {
    const bars = [
      {
        ...{ label: 'Vigor', current: 9, max: 9, color: 'moss' as const },
        ...{ visibility: 'everyone' as const, display: 'number' as const },
      },
    ];
    const look = { imageAssetId: 'portrait', frame: 'round' as const };
    const update = { fields: { ...FIELDS, ...look }, bars, controllerIds: [CAIO_ID] };

    const { shared, own } = splitUpdate(update);

    expect(shared).toEqual({
      look: {
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        imageAssetId: 'portrait',
        frame: 'round',
      },
      bars,
      controllerIds: [CAIO_ID],
    });
    expect(own.fields).not.toHaveProperty('name');
  });

  it('the sight, light and flips stay on the token', () => {
    const sightAndLight = {
      sightBright: '6.00',
      sightDim: '2.00',
      lightBright: '4.00',
      lightDim: '4.00',
      flipX: true,
    };
    const update = { fields: { ...FIELDS, ...sightAndLight }, bars: [], controllerIds: [] };

    expect(splitUpdate(update).own.fields).toEqual({ width: 2, height: 2, ...sightAndLight });
  });
});

describe('the forms of a token linked to a character', () => {
  it('are its own, and so is the shown form: the character lends neither', () => {
    const own = { ...linkedLyraRow({ activeFormId: LYRA_WOLF_FORM_ID }), forms: lyraForms() };

    const composed = composedTokenRow(own, lyraWithLook());

    expect(composed.forms.map(({ name }) => name)).toEqual(['Elfa', 'Lobo atroz', 'Corvo']);
    expect(composed.token.activeFormId).toBe(LYRA_WOLF_FORM_ID);
    expect(toTokenDto(composed, 'privileged').forms).toHaveLength(3);
  });

  it('identityOf leaves the shown form out: an unlinked copy keeps its own', () => {
    expect(identityOf(lyraPo({ activeFormId: LYRA_WOLF_FORM_ID }))).not.toHaveProperty(
      'activeFormId',
    );
  });

  it('splitUpdate keeps the forms and the shown form on the token, never on the character', () => {
    const forms = lyraForms();
    const update = {
      fields: { ...FIELDS, activeFormId: null },
      bars: [],
      controllerIds: [],
      forms,
    };

    const { shared, own } = splitUpdate(update);

    expect(own.forms).toBe(forms);
    expect(own.fields).toEqual({ width: 2, height: 2, activeFormId: null });
    expect(shared.look).not.toHaveProperty('activeFormId');
  });
});
