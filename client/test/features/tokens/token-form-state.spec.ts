import { MAX_BARS_PER_TOKEN } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  addBar,
  emptyTokenForm,
  moveBar,
  parseTokenForm,
  renameToken,
  tokenFormOf,
  type TokenFormValues,
} from '@/features/tokens/token-form-state';
import { BIA_AT_TABLE, lyra } from '../../support/table-session-fixtures';

function named(name: string): TokenFormValues {
  return renameToken(emptyTokenForm(), name);
}

describe('token form state', () => {
  it('a new token starts empty, an ally of 1 × 1, with no bar and no controller', () => {
    expect(emptyTokenForm()).toMatchObject({
      name: '',
      initials: '',
      side: 'ally',
      width: '1',
      height: '1',
      controllerIds: [],
      bars: [],
    });
  });

  it('typing the name fills the initials until they are edited by hand', () => {
    expect(named('Ogro das Cinzas').initials).toBe('OC');
    const edited = { ...named('Ogro das Cinzas'), initials: 'OG', initialsEdited: true };
    expect(renameToken(edited, 'Ogro Rubro').initials).toBe('OG');
  });

  it('editing opens with the token as it is', () => {
    const form = tokenFormOf(lyra());
    expect(form).toMatchObject({
      name: 'Lyra',
      initials: 'LY',
      initialsEdited: true,
      controllerIds: [BIA_AT_TABLE.userId],
    });
    expect(form.bars.map(({ label, current, max }) => [label, current, max])).toEqual([
      ['PV', '32', '45'],
      ['Inspiração', '1', '1'],
    ]);
  });

  it('the first bar added is the PV, ember and hidden from the other players', () => {
    expect(addBar(emptyTokenForm()).bars[0]).toMatchObject({
      label: 'PV',
      color: 'ember',
      visibility: 'controllers',
    });
  });

  it(`no more than ${MAX_BARS_PER_TOKEN} bars are added`, () => {
    let form = emptyTokenForm();
    for (let index = 0; index < MAX_BARS_PER_TOKEN + 2; index += 1) form = addBar(form);
    expect(form.bars).toHaveLength(MAX_BARS_PER_TOKEN);
  });

  it('moveBar swaps a bar with its neighbour, and does nothing past the ends', () => {
    const form = addBar(addBar(emptyTokenForm()));
    const [first, second] = form.bars;
    expect(moveBar(form, 1, -1).bars).toEqual([second, first]);
    expect(moveBar(form, 0, -1).bars).toEqual(form.bars);
  });

  it('a valid form becomes the token to send, with numbers in the bars', () => {
    const result = parseTokenForm(addBar(named('Kael')));
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
        bars: [{ label: 'PV', current: 10, max: 10, color: 'ember', visibility: 'controllers' }],
      },
    });
  });

  it('a width of "1,5" is sent as a cell and a half', () => {
    const result = parseTokenForm({ ...named('Rato'), width: '1,5', height: '0,5' });
    expect(result).toMatchObject({ ok: true, token: { width: 1.5, height: 0.5 } });
  });

  it.each(['0', '1,25', '10,5', ''])(
    'a width of "%s" is refused with the side message',
    (width) => {
      const result = parseTokenForm({ ...named('Rato'), width });
      expect(result).toMatchObject({
        ok: false,
        errors: { width: 'De 0,5 a 10 casas, de meia em meia.' },
      });
    },
  );

  it('editing a 2,5 × 1 token shows its sides with a comma', () => {
    expect(tokenFormOf(lyra({ width: 2.5, height: 1 }))).toMatchObject({
      width: '2,5',
      height: '1',
    });
  });

  it('a negative current value is accepted', () => {
    const form = addBar(named('Kael'));
    const [bar] = form.bars;
    if (!bar) throw new Error('no bar');
    const result = parseTokenForm({ ...form, bars: [{ ...bar, current: '-4' }] });
    expect(result.ok && result.token.bars[0]?.current).toBe(-4);
  });

  it('an empty name reads "Informe o nome do token."', () => {
    expect(parseTokenForm(emptyTokenForm())).toMatchObject({
      ok: false,
      errors: { name: 'Informe o nome do token.' },
    });
  });

  it('a bar without a label or with a maximum of 0 says so on that bar', () => {
    const form = addBar(named('Kael'));
    const [bar] = form.bars;
    if (!bar) throw new Error('no bar');
    const result = parseTokenForm({ ...form, bars: [{ ...bar, label: ' ', max: '0' }] });
    expect(result).toMatchObject({
      ok: false,
      errors: { bars: { 0: { label: 'Dê um nome à barra.', max: 'O máximo vai de 1 a 99 999.' } } },
    });
  });
});
