import { describe, expect, it } from 'vitest';

import { addBar } from '@/features/tokens/bar-form-state';
import {
  dialogTabsOf,
  emptyTokenForm,
  firstErrorTab,
  lightSwitchedOn,
  parseTokenForm,
  previewMetaOf,
  renameToken,
  stepSide,
  tabHasErrors,
  tokenFormOf,
  withAura,
  withControllers,
  type TokenFormValues,
} from '@/features/tokens/token-form-state';
import { auraFormOf, auraKindChosen } from '@/features/tokens/aura-form-state';
import { SIZE_PRESETS } from '@/features/tokens/token-messages';
import { BIA_AT_TABLE, lyra } from '../../support/table-session-fixtures';
import { fireAura, goldAura } from '../../support/aura-fixtures';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

const SIGHT_OFF = { sees: false, bright: '', dim: '', saved: false };

function named(name: string): TokenFormValues {
  return renameToken(emptyTokenForm(METERS), name);
}

describe('token form state', () => {
  it('a new token starts empty, an ally of 1 × 1 the master controls, with no bar', () => {
    expect(emptyTokenForm(METERS)).toMatchObject({
      name: '',
      initials: '',
      side: 'ally',
      width: 1,
      height: 1,
      controllerIds: [],
      bars: [],
    });
  });

  it('typing the name fills the initials until they are edited by hand', () => {
    expect(named('Ogro das Cinzas').initials).toBe('OC');
    const edited = { ...named('Ogro das Cinzas'), initials: 'OG', initialsEdited: true };
    expect(renameToken(edited, 'Ogro Rubro').initials).toBe('OG');
  });

  it('editing opens with the token as it is, its bar values kept as they are', () => {
    const form = tokenFormOf(lyra(), METERS);
    expect(form).toMatchObject({
      name: 'Lyra',
      initials: 'LY',
      controllerIds: [BIA_AT_TABLE.userId],
    });
    expect(form.bars.map(({ label, current, maxText }) => [label, current, maxText])).toEqual([
      ['PV', 32, '45'],
      ['Inspiração', 1, '1'],
    ]);
  });

  it('initials equal to those of the name stay automatic; others were typed by hand', () => {
    expect(tokenFormOf(lyra(), METERS).initialsEdited).toBe(false);
    expect(tokenFormOf(lyra({ initials: 'LX' }), METERS).initialsEdited).toBe(true);
  });

  it('the players pressed are sent as who controls it; nobody is an empty list', () => {
    const controllerIds = [BIA_AT_TABLE.userId];
    expect(parseTokenForm({ ...named('Kael'), controllerIds }, METERS)).toMatchObject({
      ok: true,
      token: { controllerIds },
    });
    expect(parseTokenForm(named('Kael'), METERS)).toMatchObject({
      ok: true,
      token: { controllerIds: [] },
    });
  });

  it('a bar edited to percent keeps its values and is sent as percent', () => {
    const form = tokenFormOf(lyra(), METERS);
    const bars = form.bars.map((bar) => ({ ...bar, display: 'percent' as const }));
    const result = parseTokenForm({ ...form, bars }, METERS);
    expect(result.ok && result.token.bars[0]).toMatchObject({
      current: 32,
      max: 45,
      display: 'percent',
    });
  });

  it('a valid form becomes the token to send, with numbers in the bars', () => {
    const result = parseTokenForm({ ...named('Kael'), bars: addBar([]) }, METERS);
    expect(result).toEqual({
      ok: true,
      token: {
        name: 'Kael',
        initials: 'KA',
        side: 'ally',
        width: 1,
        height: 1,
        controllerIds: [],
        imageAssetId: null,
        sightAngle: 360,
        sight: { bright: 6, dim: 6 },
        bars: [
          {
            label: 'PV',
            current: 10,
            max: 10,
            color: 'ember',
            visibility: 'controllers',
            display: 'number',
          },
        ],
      },
    });
  });

  it('a token of 2.5 × 1 opens with its sides as numbers, and is sent as they are', () => {
    const form = tokenFormOf(lyra({ width: 2.5, height: 1 }), METERS);
    expect(form).toMatchObject({ width: 2.5, height: 1 });
    expect(parseTokenForm(form, METERS)).toMatchObject({ token: { width: 2.5, height: 1 } });
  });

  it('a token whose bar is negative is saved with it negative', () => {
    const form = tokenFormOf(lyra(), METERS);
    const [bar] = form.bars;
    if (!bar) throw new Error('no bar');
    const result = parseTokenForm({ ...form, bars: [{ ...bar, current: -4 }] }, METERS);
    expect(result.ok && result.token.bars[0]?.current).toBe(-4);
  });

  it('an empty name reads "Informe o nome do token."', () => {
    expect(parseTokenForm(emptyTokenForm(METERS), METERS)).toMatchObject({
      ok: false,
      errors: { name: 'Informe o nome do token.' },
    });
  });

  it('a bar without a label says so on that bar', () => {
    const form = { ...named('Kael'), bars: addBar([]) };
    const [bar] = form.bars;
    if (!bar) throw new Error('no bar');
    const result = parseTokenForm({ ...form, bars: [{ ...bar, label: ' ' }] }, METERS);
    expect(result).toMatchObject({
      ok: false,
      errors: { bars: { 0: { label: 'Dê um nome à barra.' } } },
    });
  });
});

describe('the max of a bar', () => {
  it.each(['0', '100000', '4,5', ''])(
    'a max of "%s" reads "De 1 a 99 999." on that bar',
    (maxText) => {
      const [bar] = addBar([]);
      if (!bar) throw new Error('no bar');
      const form = { ...named('Kael'), bars: [{ ...bar, maxText }] };
      expect(parseTokenForm(form, METERS)).toMatchObject({
        ok: false,
        errors: { bars: { 0: { max: 'De 1 a 99 999.' } } },
      });
    },
  );
});

describe('firstErrorTab', () => {
  it.each([
    [{ name: 'Informe o nome do token.' }, 'basics'],
    [{ bars: { 1: { label: 'Dê um nome à barra.' } } }, 'bars'],
    [{ sight: { bright: 'De 0 a 150 m.' } }, 'vision'],
    [{ light: { dim: 'De 6 a 156 m.' } }, 'vision'],
    [{ name: 'Informe o nome do token.', bars: { 0: { label: 'Dê um nome à barra.' } } }, 'basics'],
    [{ bars: { 0: { label: 'x' } }, sight: { bright: 'x' } }, 'bars'],
  ] as const)('errors %o open the tab %s', (errors, tab) => {
    expect(firstErrorTab(errors)).toBe(tab);
  });

  it('no errors, or an empty bars record, open no tab', () => {
    expect(firstErrorTab({})).toBeNull();
    expect(firstErrorTab({ bars: {} })).toBeNull();
  });
});

describe('previewMetaOf', () => {
  it('a new token reads "Aliado · 1 × 1 casa"', () => {
    expect(previewMetaOf({ ...emptyTokenForm(METERS), sight: SIGHT_OFF })).toBe(
      'Aliado · 1 × 1 casa',
    );
  });

  it('an enemy of 2 × 2 reads "Inimigo · 2 × 2 casas"', () => {
    const form = tokenFormOf(lyra({ side: 'enemy', width: 2, height: 2, sight: null }), METERS);
    expect(previewMetaOf(form)).toBe('Inimigo · 2 × 2 casas');
  });

  it('a token that sees in the dark and gives off light says so', () => {
    const form = tokenFormOf(
      lyra({
        side: 'neutral',
        width: 0.5,
        height: 0.5,
        sight: { bright: 6, dim: 6 },
        light: { bright: 4, dim: 4, color: null, angle: 360 },
      }),
      METERS,
    );
    expect(previewMetaOf(form)).toBe('Neutro · 0,5 × 0,5 casas · vê no escuro · com luz');
  });
});

describe('stepSide', () => {
  it.each([
    [1, 1, 1.5],
    [2, -1, 1.5],
    [10, 1, 10],
    [0.5, -1, 0.5],
  ] as const)('%s cells stepped by %s is %s', (side, direction, next) => {
    expect(stepSide(side, direction)).toBe(next);
  });
});

describe('SIZE_PRESETS', () => {
  it('go from Miúdo (½) to Imenso (4 × 4)', () => {
    expect(SIZE_PRESETS.map(({ label, cells }) => [label, cells])).toEqual([
      ['Miúdo', 0.5],
      ['Médio', 1],
      ['Grande', 2],
      ['Enorme', 3],
      ['Imenso', 4],
    ]);
  });
});

describe('the sight and light of a new token', () => {
  it('a new token sees in the dark by default: until 9 m, dim until 18 m', () => {
    expect(emptyTokenForm(METERS).sight).toEqual({
      sees: true,
      bright: '9',
      dim: '18',
      saved: false,
    });
  });

  it('created untouched, it is sent with sight 6 + 6 cells and no light at all', () => {
    const result = parseTokenForm(named('Ogro'), METERS);
    expect(result).toMatchObject({ ok: true, token: { sight: { bright: 6, dim: 6 } } });
    expect(result.ok && result.token).not.toHaveProperty('light');
  });

  it('in a scene of 5 ft cells, the default reads "30" and "60"', () => {
    expect(emptyTokenForm({ cellDistance: 5, cellUnit: 'ft' }).sight).toMatchObject({
      bright: '30',
      dim: '60',
    });
  });

  it('switching the light on with empty fields fills the torch: "6" and "12"', () => {
    expect(lightSwitchedOn(named('Ogro'), METERS).light).toEqual({
      on: true,
      bright: '6',
      dim: '12',
      saved: false,
    });
  });

  it('switching the light on keeps what was typed before', () => {
    const typed = { ...named('Ogro'), light: { on: false, bright: '3', dim: '', saved: false } };
    expect(lightSwitchedOn(typed, METERS).light).toEqual({
      on: true,
      bright: '3',
      dim: '',
      saved: false,
    });
  });
});

describe('the color of the light of the token', () => {
  it('a token with a moon light opens with the moon color', () => {
    const form = tokenFormOf(
      lyra({ light: { bright: 4, dim: 4, color: 'moon', angle: 360 } }),
      METERS,
    );
    expect(form.lightColor).toBe('moon');
  });

  it('a token with a moon light is sent with the range and the color', () => {
    const form = tokenFormOf(
      lyra({ light: { bright: 4, dim: 4, color: 'moon', angle: 360 } }),
      METERS,
    );
    expect(parseTokenForm(form, METERS)).toMatchObject({
      ok: true,
      token: { light: { bright: 4, dim: 4, color: 'moon', angle: 360 } },
    });
  });

  it('a new token starts with the neutral color', () => {
    expect(emptyTokenForm(METERS).lightColor).toBeNull();
  });

  it('switching off the saved light sends light null, without a color', () => {
    const form = tokenFormOf(
      lyra({ light: { bright: 4, dim: 4, color: 'moon', angle: 360 } }),
      METERS,
    );
    const off = { ...form, light: { ...form.light, on: false } };
    expect(parseTokenForm(off, METERS)).toMatchObject({ ok: true, token: { light: null } });
  });
});

describe('the field of view and the beam of the token', () => {
  const LANTERN = { bright: 4, dim: 0, color: null, angle: 60 };

  it('a new token starts seeing and shining every side: "360" in both', () => {
    expect(emptyTokenForm(METERS)).toMatchObject({ sightAngle: '360', lightAngle: '360' });
  });

  it('editing Lyra with a field of 90° and a lantern of 60° opens with "90" and "60"', () => {
    const form = tokenFormOf(lyra({ sightAngle: 90, light: LANTERN }), METERS);

    expect([form.sightAngle, form.lightAngle]).toEqual(['90', '60']);
  });

  it('a field of "90" and a beam of "60" are sent as sightAngle 90 and light.angle 60', () => {
    const form = { ...tokenFormOf(lyra({ light: LANTERN }), METERS), sightAngle: '90' };
    const result = parseTokenForm(form, METERS);

    expect(result.ok && result.token).toMatchObject({ sightAngle: 90, light: { angle: 60 } });
  });

  it('a field of "0" and a beam of "361" are errors on their fields, and open the vision tab', () => {
    const lit = tokenFormOf(lyra({ light: LANTERN }), METERS);
    const result = parseTokenForm({ ...lit, sightAngle: '0', lightAngle: '361' }, METERS);

    const errors = result.ok ? {} : result.errors;
    expect(errors).toMatchObject({ sightAngle: 'De 1 a 360°.', lightAngle: 'De 1 a 360°.' });
    expect(firstErrorTab(errors)).toBe('vision');
  });

  it('without "Emite luz" the beam is neither checked nor sent', () => {
    const form = { ...named('Ogro'), lightAngle: 'abc' };
    const result = parseTokenForm(form, METERS);

    expect(result.ok).toBe(true);
    expect(result.ok && result.token).not.toHaveProperty('light');
  });
});

describe('token form state, the aura', () => {
  it('Lyra with a gold tint opens with it, untouched', () => {
    const form = tokenFormOf(lyra({ aura: goldAura() }), METERS);

    expect(form.aura).toMatchObject({ kind: 'color', color: 'gold', radius: '3', opacity: 50 });
    expect(form.auraEdited).toBe(false);
  });

  it('a new token opens with no aura, untouched', () => {
    expect(emptyTokenForm(METERS)).toMatchObject({ aura: { kind: 'none' }, auraEdited: false });
  });

  it('saving with the aura untouched does not send it (the token keeps its own)', () => {
    const result = parseTokenForm(tokenFormOf(lyra({ aura: fireAura() }), METERS), METERS);

    expect(result.ok && result.token).not.toHaveProperty('aura');
  });

  it('a changed aura is sent, its radius in cells', () => {
    const form = tokenFormOf(lyra(), METERS);
    const fire = auraKindChosen(auraFormOf(null, METERS), 'effect');

    const result = parseTokenForm(withAura(form, fire), METERS);

    expect(result.ok && result.token.aura).toEqual(fireAura());
  });

  it('"Nenhuma" on a token with an aura sends null', () => {
    const form = tokenFormOf(lyra({ aura: fireAura() }), METERS);

    const result = parseTokenForm(withAura(form, { ...form.aura, kind: 'none' }), METERS);

    expect(result.ok && result.token.aura).toBeNull();
  });

  it('a radius out of range is an error of the aura tab, the first after the others', () => {
    const form = tokenFormOf(lyra({ aura: fireAura() }), METERS);

    const result = parseTokenForm(withAura(form, { ...form.aura, radius: '31' }), METERS);

    expect(result).toEqual({ ok: false, errors: { aura: { radius: 'De 0 a 30 m.' } } });
    expect(firstErrorTab({ aura: { radius: 'De 0 a 30 m.' } })).toBe('aura');
    expect(tabHasErrors({ aura: { radius: 'De 0 a 30 m.' } }, 'vision')).toBe(false);
  });

  it('an empty name and a bad aura: the first tab with an error is still "Básico"', () => {
    const form = { ...tokenFormOf(lyra(), METERS), name: '' };
    const broken = withAura(form, { ...auraKindChosen(form.aura, 'image') });

    const result = parseTokenForm(broken, METERS);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.aura).toEqual({ image: 'Escolha a imagem da aura.' });
    expect(!result.ok && firstErrorTab(result.errors)).toBe('basics');
  });
});

describe('token form state, a player sending', () => {
  const lit = lightSwitchedOn({ ...named('Lobo'), sightAngle: '90' }, METERS);

  it('a player’s token goes without sight, light and field of view, whatever the form holds', () => {
    const result = parseTokenForm(lit, METERS, 'player');

    expect(result.ok).toBe(true);
    const token = result.ok ? result.token : {};
    expect(token).toMatchObject({ name: 'Lobo', initials: 'LO' });
    expect(token).not.toHaveProperty('sight');
    expect(token).not.toHaveProperty('light');
    expect(token).not.toHaveProperty('sightAngle');
  });

  it('a mistyped sight the player never sees does not stop the save', () => {
    const form = { ...named('Lobo'), sightAngle: '0', sight: { ...SIGHT_OFF, sees: true } };

    expect(parseTokenForm(form, METERS, 'player').ok).toBe(true);
  });

  it('the master sending the same form still sends the sight, the light and the field of view', () => {
    const result = parseTokenForm(lit, METERS, 'master');

    expect(result.ok && result.token).toMatchObject({ sightAngle: 90, light: { bright: 4 } });
  });
});

describe('token form state, the player’s dialog', () => {
  it('a player’s tabs leave out "Visão e luz"; the master’s keep all four', () => {
    expect(dialogTabsOf('player')).toEqual(['basics', 'bars', 'aura']);
    expect(dialogTabsOf('master')).toEqual(['basics', 'bars', 'vision', 'aura']);
  });

  it('withControllers puts the locked creator first, and once', () => {
    const caio = '9c8b7a6f-5e4d-4c3b-8a29-1f0e9d8c7b6a';
    const form = { ...named('Lobo'), controllerIds: [caio] };

    expect(withControllers(form, [BIA_AT_TABLE.userId]).controllerIds).toEqual([
      BIA_AT_TABLE.userId,
      caio,
    ]);
    const withBia = { ...form, controllerIds: [caio, BIA_AT_TABLE.userId] };
    expect(withControllers(withBia, [BIA_AT_TABLE.userId])).toBe(withBia);
  });
});

describe('token form state, the forms', () => {
  const DWARF = {
    id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    name: 'Anão',
    imageAssetId: null,
    width: 1,
    height: 1,
    frame: 'square' as const,
  };
  const shapeshifter = () => tokenFormOf(lyra({ forms: [DWARF] }), METERS);

  it('"Formas" comes after "Barras" when shown, for the master and for a player', () => {
    expect(dialogTabsOf('master', true)).toEqual(['basics', 'bars', 'forms', 'vision', 'aura']);
    expect(dialogTabsOf('player', true)).toEqual(['basics', 'bars', 'forms', 'aura']);
  });

  it('a name error of a form marks "Formas", found after "Barras" and before "Visão e luz"', () => {
    const errors = { forms: { [DWARF.id]: 'Dê um nome à forma.' }, sightAngle: 'De 1 a 360.' };

    expect(tabHasErrors(errors, 'forms')).toBe(true);
    expect(firstErrorTab(errors)).toBe('forms');
    expect(firstErrorTab({ ...errors, bars: { 0: { label: 'x' } } })).toBe('bars');
  });

  it('untouched forms are not sent, so the token keeps its own', () => {
    const result = parseTokenForm(shapeshifter(), METERS);

    expect(result.ok && result.token).not.toHaveProperty('forms');
  });

  it('touched forms go as the whole list', () => {
    const form = shapeshifter();
    const forms = { ...form.forms, list: [{ ...DWARF, name: 'Anã' }], edited: true };

    const result = parseTokenForm({ ...form, forms }, METERS);

    expect(result.ok && result.token.forms).toEqual([{ ...DWARF, name: 'Anã' }]);
  });

  it('a form without a name refuses the save, with the error on that form', () => {
    const form = shapeshifter();
    const forms = { ...form.forms, list: [{ ...DWARF, name: ' ' }], edited: true };

    const result = parseTokenForm({ ...form, forms }, METERS);

    expect(result).toEqual({ ok: false, errors: { forms: { [DWARF.id]: 'Dê um nome à forma.' } } });
  });
});
