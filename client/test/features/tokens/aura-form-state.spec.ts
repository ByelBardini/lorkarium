import { describe, expect, it } from 'vitest';
import {
  auraFormOf,
  auraKindChosen,
  parseAuraForm,
  type AuraFormValues,
} from '@/features/tokens/aura-form-state';
import { fireAura, goldAura, RUNE_ASSET_ID, runeAura } from '../../support/aura-fixtures';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };
const FEET = { cellDistance: 5, cellUnit: 'ft' };

function chosen(kind: AuraFormValues['kind'], changes: Partial<AuraFormValues> = {}) {
  return { ...auraKindChosen(auraFormOf(null, METERS), kind), ...changes };
}

describe('auraFormOf', () => {
  it('a token without an aura opens on "Nenhuma", the radius ready at 3 m', () => {
    expect(auraFormOf(null, METERS)).toMatchObject({ kind: 'none', radius: '3' });
  });

  it('a fire aura of 2 cells opens as the effect Fogo, natural, at 3 m and 100%', () => {
    expect(auraFormOf(fireAura(), METERS)).toMatchObject({
      kind: 'effect',
      effect: 'fire',
      effectColor: null,
      radius: '3',
      opacity: 100,
    });
  });

  it('a gold tint opens as Cor Ouro at its opacity, the radius in the unit of the scene', () => {
    expect(auraFormOf(goldAura({ radius: 1.5 }), FEET)).toMatchObject({
      kind: 'color',
      color: 'gold',
      radius: '7,5',
      opacity: 50,
    });
  });

  it('an image aura opens with its image chosen', () => {
    expect(auraFormOf(runeAura(), METERS)).toMatchObject({
      kind: 'image',
      imageAssetId: RUNE_ASSET_ID,
      imageShape: 'square',
      radius: '1,5',
    });
  });

  it('a round image aura opens as Redonda', () => {
    expect(auraFormOf(runeAura({ shape: 'round' }), METERS).imageShape).toBe('round');
  });

  it('switching from a round image to Cor and back keeps Redonda', () => {
    const round = auraFormOf(runeAura({ shape: 'round' }), METERS);

    expect(auraKindChosen(auraKindChosen(round, 'color'), 'image').imageShape).toBe('round');
  });
});

describe('auraKindChosen', () => {
  it.each([
    ['color', 50],
    ['effect', 100],
    ['image', 100],
  ] as const)('choosing %s from none starts at %i percent', (kind, opacity) => {
    expect(chosen(kind).opacity).toBe(opacity);
  });

  it('switching from Cor to Efeito keeps the radius and the opacity', () => {
    const color = chosen('color', { radius: '6', opacity: 35 });

    expect(auraKindChosen(color, 'effect')).toMatchObject({
      kind: 'effect',
      radius: '6',
      opacity: 35,
    });
  });
});

describe('parseAuraForm', () => {
  it('Fogo at 3 m, natural, 100% is the fire effect of 2 cells', () => {
    const form = chosen('effect', { effect: 'fire', radius: '3', effectColor: null });

    expect(parseAuraForm(form, METERS)).toEqual({
      ok: true,
      aura: { kind: 'effect', effect: 'fire', radius: 2, color: null, opacity: 100 },
    });
  });

  it('Cor Brasa at 4,5 m and 40% is the ember tint of 3 cells', () => {
    const form = chosen('color', { color: 'ember', radius: '4,5', opacity: 40 });

    expect(parseAuraForm(form, METERS)).toEqual({
      ok: true,
      aura: { kind: 'color', color: 'ember', radius: 3, opacity: 40 },
    });
  });

  it('an image chosen at 0 m is the image aura on the footprint only', () => {
    const form = chosen('image', { imageAssetId: RUNE_ASSET_ID, radius: '0' });

    expect(parseAuraForm(form, METERS)).toEqual({
      ok: true,
      aura: {
        kind: 'image',
        imageAssetId: RUNE_ASSET_ID,
        radius: 0,
        opacity: 100,
        shape: 'square',
      },
    });
  });

  it('an image chosen as Redonda is the round image aura', () => {
    const form = chosen('image', { imageAssetId: RUNE_ASSET_ID, imageShape: 'round' });

    expect(parseAuraForm(form, METERS)).toMatchObject({ ok: true, aura: { shape: 'round' } });
  });

  it('"Nenhuma" sends no aura (null), whatever was typed', () => {
    const form = { ...chosen('effect', { radius: '99' }), kind: 'none' as const };

    expect(parseAuraForm(form, METERS)).toEqual({ ok: true, aura: null });
  });

  it.each(['31', '-1', 'três'])('a radius of "%s" m is refused as from 0 to 30 m', (radius) => {
    const form = chosen('effect', { radius });

    expect(parseAuraForm(form, METERS)).toEqual({
      ok: false,
      errors: { radius: 'De 0 a 30 m.' },
    });
  });

  it('30 m, the widest, still goes as 20 cells', () => {
    const result = parseAuraForm(chosen('color', { radius: '30' }), METERS);

    expect(result.ok && result.aura?.radius).toBe(20);
  });

  it('an empty radius is refused asking for it', () => {
    expect(parseAuraForm(chosen('color', { radius: ' ' }), METERS)).toEqual({
      ok: false,
      errors: { radius: 'Informe o raio.' },
    });
  });

  it('Imagem without an image chosen is refused asking for one', () => {
    expect(parseAuraForm(chosen('image'), METERS)).toEqual({
      ok: false,
      errors: { image: 'Escolha a imagem da aura.' },
    });
  });
});
