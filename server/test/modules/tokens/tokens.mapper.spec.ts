import { describe, expect, it } from 'vitest';
import { toTokenDto, toTokenUpdatePo } from '../../../src/modules/tokens/tokens.mapper';
import { LYRA_PORTRAIT_ID } from '../../support/assets-factories';
import { BIA_ID } from '../../support/campaigns-factories';
import { LYRA_ID, lyraPo, lyraRow } from '../../support/tokens-factories';

describe('tokens mapper', () => {
  it('the privileged audience gets every bar and canControl', () => {
    const dto = toTokenDto(lyraRow(), 'privileged');
    expect(dto).toMatchObject({ id: LYRA_ID, canControl: true, controllerIds: [BIA_ID] });
    expect(dto.bars.map(({ label, position }) => [label, position])).toEqual([
      ['PV', 0],
      ['Inspiração', 1],
    ]);
  });

  it('others never receive a controllers bar, and the rest keep their position', () => {
    const dto = toTokenDto(lyraRow(), 'others');
    expect(dto.canControl).toBe(false);
    expect(dto.bars.map(({ label, position }) => [label, position])).toEqual([['Inspiração', 1]]);
    expect(JSON.stringify(dto)).not.toContain('"PV"');
  });

  it.each(['privileged', 'others'] as const)(
    'a token on the objects layer reaches the %s audience on the objects layer',
    (audience) => {
      const row = lyraRow({ token: lyraPo({ layer: 'objects' }) });
      expect(toTokenDto(row, audience).layer).toBe('objects');
    },
  );

  it('others receive the image, frame, flips and facing exactly as the privileged (not a secret)', () => {
    const look = {
      imageAssetId: LYRA_PORTRAIT_ID,
      frame: 'round',
      flipX: true,
      flipY: false,
      facing: 135,
    } as const;
    const row = lyraRow({ token: lyraPo(look) });

    expect(toTokenDto(row, 'others')).toMatchObject(look);
    expect(toTokenDto(row, 'privileged')).toMatchObject(look);
  });

  it('an update with a new image writes it, and one without the look leaves the look out', () => {
    const base = {
      name: 'Lyra',
      initials: 'LY',
      side: 'ally',
      width: 1,
      height: 1,
      controllerIds: [BIA_ID],
      bars: [],
    } as const;

    const withImage = toTokenUpdatePo(
      { ...base, bars: [], controllerIds: [BIA_ID], imageAssetId: null },
      [BIA_ID],
    );
    const without = toTokenUpdatePo({ ...base, bars: [], controllerIds: [BIA_ID] }, [BIA_ID]);

    expect(withImage.fields).toEqual({
      name: 'Lyra',
      initials: 'LY',
      side: 'ally',
      width: 1,
      height: 1,
      imageAssetId: null,
    });
    expect(without.fields).not.toHaveProperty('imageAssetId');
    expect(without.fields).not.toHaveProperty('frame');
  });

  it('a sight saved as "12.00" and "4.00" becomes { bright: 12, dim: 4 }, the same for both audiences', () => {
    const row = lyraRow({ token: lyraPo({ sightBright: '12.00', sightDim: '4.00' }) });

    expect(toTokenDto(row, 'privileged').sight).toEqual({ bright: 12, dim: 4 });
    expect(toTokenDto(row, 'others').sight).toEqual({ bright: 12, dim: 4 });
  });

  it('a token with both sight columns null does not see (sight null)', () => {
    expect(toTokenDto(lyraRow(), 'others').sight).toBeNull();
  });

  it('an update with sight writes both columns, null clears them, and without sight writes none', () => {
    const base = {
      name: 'Lyra',
      initials: 'LY',
      side: 'ally',
      width: 1,
      height: 1,
      controllerIds: [BIA_ID],
      bars: [],
    } as const;

    const lists = { bars: [], controllerIds: [BIA_ID] };
    const seeing = toTokenUpdatePo({ ...base, ...lists, sight: { bright: 6.666, dim: 2 } }, [
      BIA_ID,
    ]);
    const blind = toTokenUpdatePo({ ...base, ...lists, sight: null }, [BIA_ID]);
    const kept = toTokenUpdatePo({ ...base, ...lists }, [BIA_ID]);

    expect(seeing.fields).toMatchObject({ sightBright: '6.67', sightDim: '2.00' });
    expect(blind.fields).toMatchObject({ sightBright: null, sightDim: null });
    expect(kept.fields).not.toHaveProperty('sightBright');
    expect(kept.fields).not.toHaveProperty('sightDim');
  });

  it('the token DTO carries no persistence fields', () => {
    expect(toTokenDto(lyraRow(), 'others')).not.toHaveProperty('sceneId');
  });

  it('an update command becomes the fields, the bars and the controllers to save', () => {
    const update = toTokenUpdatePo(
      {
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        width: 1,
        height: 1,
        controllerIds: [BIA_ID],
        bars: [{ label: 'PV', current: 1, max: 9, color: 'ember', visibility: 'everyone' }],
      },
      [BIA_ID],
    );
    expect(update).toEqual({
      fields: { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 },
      bars: [{ label: 'PV', current: 1, max: 9, color: 'ember', visibility: 'everyone' }],
      controllerIds: [BIA_ID],
    });
  });
});
