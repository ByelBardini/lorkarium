import { describe, expect, it } from 'vitest';
import {
  toTokenDto,
  toTokenLightPo,
  toTokenUpdatePo,
  tokenEyeOf,
  tokenLightOf,
} from '../../../src/modules/tokens/tokens.mapper';
import { LYRA_PORTRAIT_ID } from '../../support/assets-factories';
import { BIA_ID } from '../../support/campaigns-factories';
import { LYRA_ID, lyraPo, lyraRow } from '../../support/tokens-factories';

const PERCENT_PV = {
  label: 'PV',
  current: 1,
  max: 9,
  color: 'ember',
  visibility: 'everyone',
  display: 'percent',
} as const;

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

  it('others receive the image, frame, flips, facing and defeat exactly as the privileged (not a secret)', () => {
    const look = {
      imageAssetId: LYRA_PORTRAIT_ID,
      frame: 'round',
      flipX: true,
      flipY: false,
      facing: 135,
      defeated: true,
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

  it('a light saved as "4.00" and "4.00", lit, becomes a neutral { bright: 4, dim: 4 } for both audiences', () => {
    const light = { lightBright: '4.00', lightDim: '4.00', lightLit: true };
    const row = lyraRow({ token: lyraPo(light) });

    for (const audience of ['privileged', 'others'] as const) {
      expect(toTokenDto(row, audience)).toMatchObject({
        light: { bright: 4, dim: 4, color: null, angle: 360 },
        lightLit: true,
      });
    }
  });

  it('a light saved with the color moon carries it to the DTO', () => {
    const token = lyraPo({ lightBright: '4.00', lightDim: '4.00', lightColor: 'moon' });
    expect(toTokenDto(lyraRow({ token }), 'others').light).toEqual({
      bright: 4,
      dim: 4,
      color: 'moon',
      angle: 360,
    });
  });

  it('a torch light sent is saved in the three columns', () => {
    expect(toTokenLightPo({ bright: 4, dim: 4, color: 'torch', angle: 360 })).toEqual({
      lightBright: '4.00',
      lightDim: '4.00',
      lightColor: 'torch',
      lightAngle: 360,
    });
  });

  it('a token with both light columns null emits no light (light null)', () => {
    expect(toTokenDto(lyraRow(), 'others').light).toBeNull();
  });

  it('a light that is out reaches the viewer with lightLit false', () => {
    const row = lyraRow({
      token: lyraPo({ lightBright: '4.00', lightDim: '0.00', lightLit: false }),
    });
    expect(toTokenDto(row, 'others').lightLit).toBe(false);
  });

  it('a light of 10/3 and 4 is saved to the hundredth', () => {
    expect(toTokenLightPo({ bright: 10 / 3, dim: 4, color: null, angle: 360 })).toEqual({
      lightBright: '3.33',
      lightDim: '4.00',
      lightColor: null,
      lightAngle: 360,
    });
  });

  it('no light clears the three columns and opens the beam back to 360', () => {
    expect(toTokenLightPo(null)).toEqual({
      lightBright: null,
      lightDim: null,
      lightColor: null,
      lightAngle: 360,
    });
  });

  it('an update with light writes both columns and without light writes none', () => {
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

    const lit = toTokenUpdatePo(
      { ...base, ...lists, light: { bright: 4, dim: 2, color: null, angle: 360 } },
      [BIA_ID],
    );
    const kept = toTokenUpdatePo({ ...base, ...lists }, [BIA_ID]);

    expect(lit.fields).toMatchObject({ lightBright: '4.00', lightDim: '2.00' });
    expect(kept.fields).not.toHaveProperty('lightBright');
    expect(kept.fields).not.toHaveProperty('lightLit');
  });

  it('the light of a lit token shines from the center of its footprint', () => {
    const row = lyraRow({
      token: lyraPo({ col: 3, row: 4, width: 2, height: 1, lightBright: '4.00', lightDim: '4.00' }),
    });
    expect(tokenLightOf(row)).toEqual({
      center: { x: 4, y: 4.5 },
      range: { bright: 4, dim: 4 },
      cone: null,
    });
  });

  it('a token whose light is out gives no light source', () => {
    const light = { lightBright: '4.00', lightDim: '4.00', lightLit: false };
    expect(tokenLightOf(lyraRow({ token: lyraPo(light) }))).toBeNull();
  });

  it('a token without light gives no light source', () => {
    expect(tokenLightOf(lyraRow())).toBeNull();
  });

  it('a bar shown as percent reaches the viewer as percent', () => {
    const row = lyraRow();
    const bars = row.bars.map((bar) => ({ ...bar, display: 'percent' as const }));
    const dto = toTokenDto({ ...row, bars }, 'others');
    expect(dto.bars.map(({ display }) => display)).toEqual(['percent']);
  });

  it.each([true, false])(
    'a token saved with hidden %s carries it the same to both audiences (who gets it may know)',
    (hidden) => {
      const row = lyraRow({ token: lyraPo({ hidden }) });

      expect(toTokenDto(row, 'privileged').hidden).toBe(hidden);
      expect(toTokenDto(row, 'others').hidden).toBe(hidden);
    },
  );

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
        bars: [PERCENT_PV],
      },
      [BIA_ID],
    );
    expect(update).toEqual({
      fields: { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 },
      bars: [PERCENT_PV],
      controllerIds: [BIA_ID],
    });
  });
});

describe('tokens mapper, the field of view and the lantern', () => {
  const lyraUpdate = {
    name: 'Lyra',
    initials: 'LY',
    side: 'ally' as const,
    width: 1,
    height: 1,
    controllerIds: [BIA_ID],
    bars: [],
  };

  it.each(['privileged', 'others'] as const)(
    'a token saved with a field of 90° reaches the %s audience with sightAngle 90',
    (audience) => {
      const row = lyraRow({ token: lyraPo({ sightAngle: 90 }) });
      expect(toTokenDto(row, audience).sightAngle).toBe(90);
    },
  );

  it('a lantern saved with a beam of 60° reaches the viewer with light.angle 60', () => {
    const token = lyraPo({ lightBright: '6.00', lightDim: '0.00', lightAngle: 60 });
    expect(toTokenDto(lyraRow({ token }), 'others').light?.angle).toBe(60);
  });

  it('a lantern of 60° is saved in the angle column', () => {
    expect(toTokenLightPo({ bright: 6, dim: 0, color: null, angle: 60 }).lightAngle).toBe(60);
  });

  it('an update with sightAngle writes the column and without it writes none', () => {
    const narrowed = toTokenUpdatePo({ ...lyraUpdate, sightAngle: 90 }, [BIA_ID]);
    const kept = toTokenUpdatePo(lyraUpdate, [BIA_ID]);

    expect(narrowed.fields.sightAngle).toBe(90);
    expect(kept.fields).not.toHaveProperty('sightAngle');
  });

  it('the eye of Lyra looking left with 90° is the cone of 180 / 90 around her footprint', () => {
    const row = lyraRow({ token: lyraPo({ col: 5, row: 5, facing: 180, sightAngle: 90 }) });
    expect(tokenEyeOf(row)).toEqual({
      center: { x: 5.5, y: 5.5 },
      range: null,
      field: {
        cone: { facing: 180, angle: 90 },
        around: { x: 5, y: 5, width: 1, height: 1 },
      },
    });
  });

  it('the eye of a token with a field of 360° sees every side (field null)', () => {
    expect(tokenEyeOf(lyraRow()).field).toBeNull();
  });

  it('a lantern of 60° shines in the direction the token looks', () => {
    const lantern = { lightBright: '6.00', lightDim: '0.00', lightAngle: 60, facing: 90 };
    expect(tokenLightOf(lyraRow({ token: lyraPo(lantern) }))?.cone).toEqual({
      facing: 90,
      angle: 60,
    });
  });

  it('a light of 360° shines every side (cone null)', () => {
    const torch = { lightBright: '4.00', lightDim: '4.00', facing: 90 };
    expect(tokenLightOf(lyraRow({ token: lyraPo(torch) }))?.cone).toBeNull();
  });
});
