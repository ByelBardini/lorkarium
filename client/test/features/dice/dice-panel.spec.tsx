import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { OFFLINE_MESSAGE } from '@/features/campaigns/campaign-messages';
import { VHARN } from '../../support/campaigns-api-fake';
import { ACERTO, BENCAO } from '../../support/dice-fixtures';
import { openVharnWithRoster, renderDicePanel } from '../../support/dice-panel-harness';
import { CREATED_SAVED_ROLL_ID } from '../../support/saved-rolls-api-fake';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const WINDOW_ASPECT = Math.min(3, Math.max(0.5, window.innerWidth / window.innerHeight));

async function clickTimes(user: UserEvent, name: string, times: number): Promise<void> {
  for (let step = 0; step < times; step += 1) {
    await user.click(screen.getByRole('button', { name }));
  }
}

function lastSent(deps: TestDependencies) {
  return deps.dice.sent.at(-1);
}

describe('DicePanel — the tray', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    openVharnWithRoster(deps);
  });

  it('d20, +5 and Vantagem preview 2d20kh1+5 and Rolar sends it public with the window’s aspect', async () => {
    renderDicePanel(deps);
    await user.click(screen.getByRole('button', { name: 'Adicionar d20' }));
    await clickTimes(user, 'Aumentar modificador', 5);
    await user.click(screen.getByRole('radio', { name: 'Vantagem' }));
    expect(screen.getByRole('status', { name: 'Prévia da rolagem' })).toHaveTextContent(
      '2d20kh1+5',
    );
    await user.click(screen.getByRole('button', { name: 'Rolar' }));
    expect(deps.dice.sent).toEqual([
      {
        campaignId: VHARN.id,
        request: {
          label: null,
          parts: [{ label: null, expression: '2d20kh1+5' }],
          visibility: 'public',
          aspect: WINDOW_ASPECT,
        },
      },
    ]);
  });

  it('a roll the server took empties the tray and keeps the mode and "Quem vê"', async () => {
    renderDicePanel(deps);
    await user.click(screen.getByRole('button', { name: 'Adicionar d6' }));
    await user.click(screen.getByRole('radio', { name: 'Vantagem' }));
    await user.click(screen.getByRole('radio', { name: 'Só o mestre' }));
    await user.click(screen.getByRole('button', { name: 'Rolar' }));
    expect(lastSent(deps)?.request.parts).toEqual([{ label: null, expression: '2d6kh1' }]);
    expect(screen.getByRole('textbox', { name: 'Fórmula' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Rolar' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Só o mestre' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Adicionar d8' }));
    expect(screen.getByRole('radio', { name: 'Vantagem' })).toBeChecked();
  });

  it('the formula field has its placeholder and Enter in it rolls', async () => {
    renderDicePanel(deps);
    const field = screen.getByRole('textbox', { name: 'Fórmula' });
    expect(field).toHaveAttribute('placeholder', 'Ex.: 2d6+3');
    await user.type(field, '2d6+3{Enter}');
    expect(lastSent(deps)?.request.parts).toEqual([{ label: null, expression: '2d6+3' }]);
  });

  it('Enter on an unreadable formula sends nothing', async () => {
    renderDicePanel(deps);
    await user.type(screen.getByRole('textbox', { name: 'Fórmula' }), '1d{Enter}');
    expect(deps.dice.sent).toEqual([]);
  });

  it('"Como escrever?" opens each flag with an example and "Fechar ajuda" hides them', async () => {
    renderDicePanel(deps);
    const toggle = screen.getByRole('button', { name: 'Como escrever?' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Fechar ajuda');
    const help = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    const codes = [...(help?.querySelectorAll('code') ?? [])].map((code) => code.textContent);
    expect(codes).toEqual([
      ...['+ -', '2d6+1d4-1', 'khN', '2d20kh1', 'klN', '4d6kl2', 'dlN', '5d6dl2'],
      ...['dhN', '4d6dh1', '!', '1d6!', '>N', '8d10>6', '<N', '4d6<3', 'rN', '1d20r1'],
    ]);
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('1d20r1')).toBeNull();
  });

  it('the preview shows the formula with the mode applied', async () => {
    renderDicePanel(deps);
    await user.type(screen.getByRole('textbox', { name: 'Fórmula' }), '1d20+2');
    await user.click(screen.getByRole('radio', { name: 'Desvantagem' }));
    expect(screen.getByRole('status', { name: 'Prévia da rolagem' })).toHaveTextContent(
      '2d20kl1+2',
    );
  });

  it('offline says so and Rolar is enabled again', async () => {
    deps.dice.answer = { ok: false, failure: { kind: 'offline' } };
    renderDicePanel(deps);
    await user.click(screen.getByRole('button', { name: 'Adicionar d20' }));
    await user.click(screen.getByRole('button', { name: 'Rolar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(OFFLINE_MESSAGE);
    expect(screen.getByRole('button', { name: 'Rolar' })).toBeEnabled();
  });

  it('"Limpar" empties the tray and puts the mode back on Normal', async () => {
    renderDicePanel(deps);
    await user.click(screen.getByRole('button', { name: 'Adicionar d20' }));
    await user.click(screen.getByRole('radio', { name: 'Vantagem' }));
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(screen.getByRole('textbox', { name: 'Fórmula' })).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Adicionar d20' }));
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
    expect(screen.getByRole('status', { name: 'Prévia da rolagem' })).toHaveTextContent(/^1d20$/);
  });

  it('"Quem vê" starts on Todos and "Só o mestre" sends the roll to the masters', async () => {
    renderDicePanel(deps);
    const audience = screen.getByRole('radiogroup', { name: 'Quem vê' });
    expect(within(audience).getByRole('radio', { name: 'Todos' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Adicionar d20' }));
    await user.click(within(audience).getByRole('radio', { name: 'Só o mestre' }));
    await user.click(screen.getByRole('button', { name: 'Rolar' }));
    expect(lastSent(deps)?.request.visibility).toBe('masters');
  });

  it('typing 1d says the sides are missing and sends nothing', async () => {
    renderDicePanel(deps);
    const field = screen.getByRole('textbox', { name: 'Fórmula' });
    await user.type(field, '1d');
    expect(field).toHaveAccessibleDescription('Faltou o número de faces.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: 'Rolar' }));
    expect(deps.dice.sent).toEqual([]);
  });

  it('a first die with a modifier disables Vantagem and Desvantagem with the hint', async () => {
    renderDicePanel(deps);
    await user.type(screen.getByRole('textbox', { name: 'Fórmula' }), '1d6!');
    for (const name of ['Vantagem', 'Desvantagem']) {
      expect(screen.getByRole('radio', { name })).toBeDisabled();
    }
    expect(screen.getByRole('radiogroup', { name: 'Modo da rolagem' })).toHaveAccessibleDescription(
      /O primeiro dado já tem modificador/,
    );
  });

  it('Vantagem chosen and then blocked rolls the plain notation', async () => {
    renderDicePanel(deps);
    const field = screen.getByRole('textbox', { name: 'Fórmula' });
    await user.type(field, '1d20');
    await user.click(screen.getByRole('radio', { name: 'Vantagem' }));
    await user.type(field, '!');
    expect(screen.getByRole('radio', { name: 'Vantagem' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Rolar' }));
    expect(lastSent(deps)?.request.parts).toEqual([{ label: null, expression: '1d20!' }]);
  });

  it('rate_limited says to wait 1 s', async () => {
    deps.dice.answer = { ok: false, failure: { kind: 'rate_limited', retryAfterSeconds: 1 } };
    renderDicePanel(deps);
    await user.click(screen.getByRole('button', { name: 'Adicionar d20' }));
    await user.click(screen.getByRole('button', { name: 'Rolar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Muitas rolagens seguidas. Espere 1 s.');
    expect(screen.getByRole('textbox', { name: 'Fórmula' })).toHaveValue('1d20');
  });

  it('a d7 typed in "Faces do dado" joins the tray', async () => {
    renderDicePanel(deps);
    await user.type(screen.getByRole('textbox', { name: 'Faces do dado' }), '7');
    await user.click(screen.getByRole('button', { name: 'Adicionar dado' }));
    expect(screen.getByRole('textbox', { name: 'Fórmula' })).toHaveValue('1d7');
  });

  it('1001 faces says "De 2 a 1000 faces." and adds nothing', async () => {
    renderDicePanel(deps);
    const sides = screen.getByRole('textbox', { name: 'Faces do dado' });
    await user.type(sides, '1001');
    await user.click(screen.getByRole('button', { name: 'Adicionar dado' }));
    expect(sides).toHaveAccessibleDescription('De 2 a 1000 faces.');
    expect(screen.getByRole('textbox', { name: 'Fórmula' })).toHaveValue('');
  });

  it('"Aumentar modificador" five times after a d20 shows +5 and previews 1d20+5', async () => {
    renderDicePanel(deps);
    await user.click(screen.getByRole('button', { name: 'Adicionar d20' }));
    await clickTimes(user, 'Aumentar modificador', 5);
    const modifier = screen.getByRole('group', { name: 'Modificador' });
    expect(within(modifier).getByText('+5')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Prévia da rolagem' })).toHaveTextContent('1d20+5');
  });

  it('"Diminuir modificador" below zero shows −1', async () => {
    renderDicePanel(deps);
    const modifier = screen.getByRole('group', { name: 'Modificador' });
    expect(within(modifier).getByText('0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Diminuir modificador' }));
    expect(within(modifier).getByText('−1')).toBeInTheDocument();
  });

  it('an unreadable formula shows the modifier as —', async () => {
    renderDicePanel(deps);
    await user.type(screen.getByRole('textbox', { name: 'Fórmula' }), '1d');
    const modifier = screen.getByRole('group', { name: 'Modificador' });
    expect(within(modifier).getByText('—')).toBeInTheDocument();
  });

  it('"Modo da rolagem" offers Normal, Vantagem and Desvantagem, Normal chosen', () => {
    renderDicePanel(deps);
    const group = screen.getByRole('radiogroup', { name: 'Modo da rolagem' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Normal', 'Vantagem', 'Desvantagem']);
    expect(within(group).getByRole('radio', { name: 'Normal' })).toBeChecked();
  });

  it('Vantagem on an empty tray puts 1d20 and previews 2d20kh1', async () => {
    renderDicePanel(deps);
    await user.click(screen.getByRole('radio', { name: 'Vantagem' }));
    expect(screen.getByRole('textbox', { name: 'Fórmula' })).toHaveValue('1d20');
    expect(screen.getByRole('radio', { name: 'Vantagem' })).toBeChecked();
    expect(screen.getByRole('status', { name: 'Prévia da rolagem' })).toHaveTextContent('2d20kh1');
  });

  it('the chosen mode says what it does under the segments', async () => {
    renderDicePanel(deps);
    const group = screen.getByRole('radiogroup', { name: 'Modo da rolagem' });
    expect(group).not.toHaveAccessibleDescription();
    await user.click(screen.getByRole('radio', { name: 'Desvantagem' }));
    expect(group).toHaveAccessibleDescription('Rola um dado a mais e fica com o menor.');
    await user.click(screen.getByRole('radio', { name: 'Vantagem' }));
    expect(group).toHaveAccessibleDescription('Rola um dado a mais e fica com o maior.');
  });

  it('has neither "Dados 3D" nor "Aparência dos dados": both live in Minha conta', () => {
    renderDicePanel(deps);
    expect(screen.queryByRole('switch', { name: 'Dados 3D' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Aparência dos dados' })).toBeNull();
  });
});

describe('DicePanel — saved rolls', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(() => {
    deps = testDependencies();
    user = userEvent.setup();
    deps.savedRolls.rolls.set(VHARN.id, [ACERTO, BENCAO]);
    openVharnWithRoster(deps);
  });

  it('the "Rolagens salvas" list has a tag per saved roll with its name and formula', async () => {
    renderDicePanel(deps);
    const list = await screen.findByRole('list', { name: 'Rolagens salvas' });
    const tags = within(list).getAllByRole('listitem');
    expect(tags).toHaveLength(2);
    const acerto = within(tags[0] as HTMLElement).getByRole('button', { name: 'Rolar Acerto' });
    expect(acerto).toHaveTextContent('Acerto1d20+5');
    expect(within(acerto).getByText('1d20+5')).toHaveClass('font-mono');
  });

  it('the tag’s tooltip shows the whole formula', async () => {
    renderDicePanel(deps);
    await user.hover(await screen.findByRole('button', { name: 'Rolar Acerto' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('1d20+5');
  });

  it('"Rolar Acerto" sends its parts labeled "Acerto"', async () => {
    renderDicePanel(deps);
    await user.click(await screen.findByRole('button', { name: 'Rolar Acerto' }));
    expect(lastSent(deps)?.request).toMatchObject({
      label: 'Acerto',
      parts: [{ label: 'Acerto', expression: '1d20+5' }],
      visibility: 'public',
    });
  });

  it('"Rolar Acerto" rolls with the tray’s "Quem vê"', async () => {
    renderDicePanel(deps);
    await user.click(screen.getByRole('radio', { name: 'Só o mestre' }));
    await user.click(await screen.findByRole('button', { name: 'Rolar Acerto' }));
    expect(lastSent(deps)?.request.visibility).toBe('masters');
  });

  it('the tray sums no saved roll: no "Somar … à bandeja" nor "Rolagens na bandeja"', async () => {
    renderDicePanel(deps);
    await screen.findByRole('button', { name: 'Rolar Acerto' });
    expect(screen.queryByRole('button', { name: /à bandeja/ })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Rolagens na bandeja' })).toBeNull();
  });

  it('"Salvar esta rolagem" creates it through the API and lists it', async () => {
    renderDicePanel(deps);
    await screen.findByRole('button', { name: 'Rolar Acerto' });
    await user.type(screen.getByRole('textbox', { name: 'Fórmula' }), '1d8+3');
    await user.click(screen.getByRole('button', { name: 'Salvar esta rolagem' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome da rolagem' }), 'Espada');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(deps.savedRolls.answers.callsOf('create')).toEqual([
      { name: 'Espada', parts: [{ label: null, expression: '1d8+3' }] },
    ]);
    const list = screen.getByRole('list', { name: 'Rolagens salvas' });
    expect(within(list).getByText('Espada')).toBeInTheDocument();
    expect(deps.savedRolls.rolls.get(VHARN.id)?.at(-1)?.id).toBe(CREATED_SAVED_ROLL_ID);
  });

  it('a name taken says so under the field', async () => {
    deps.savedRolls.answers.answer('create', { ok: false, failure: { kind: 'name_taken' } });
    renderDicePanel(deps);
    await user.click(screen.getByRole('button', { name: 'Adicionar d20' }));
    await user.click(screen.getByRole('button', { name: 'Salvar esta rolagem' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome da rolagem' }), 'Acerto');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('textbox', { name: 'Nome da rolagem' })).toHaveAccessibleDescription(
      'Já existe uma rolagem com esse nome.',
    );
  });

  it('Enter in the name saves and Esc closes without saving', async () => {
    renderDicePanel(deps);
    await user.click(screen.getByRole('button', { name: 'Adicionar d6' }));
    await user.click(screen.getByRole('button', { name: 'Salvar esta rolagem' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome da rolagem' }), 'Dano{Enter}');
    expect(deps.savedRolls.answers.callsOf('create')).toEqual([
      { name: 'Dano', parts: [{ label: null, expression: '1d6' }] },
    ]);
    await user.click(screen.getByRole('button', { name: 'Salvar esta rolagem' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome da rolagem' }), 'Outra{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Nome da rolagem' })).toBeNull();
    expect(deps.savedRolls.answers.callsOf('create')).toHaveLength(1);
  });

  it('"Cancelar" closes the name field', async () => {
    renderDicePanel(deps);
    await user.click(screen.getByRole('button', { name: 'Adicionar d6' }));
    await user.click(screen.getByRole('button', { name: 'Salvar esta rolagem' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: 'Nome da rolagem' })).toBeNull();
  });

  it('the bookmark is off with an empty or unreadable tray', async () => {
    renderDicePanel(deps);
    const bookmark = screen.getByRole('button', { name: 'Salvar esta rolagem' });
    expect(bookmark).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Fórmula' }), '1d');
    expect(bookmark).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Fórmula' }), '6');
    expect(bookmark).toBeEnabled();
  });

  it('"Apagar" asks first and only the confirmation removes it', async () => {
    renderDicePanel(deps);
    await user.click(await screen.findByRole('button', { name: 'Apagar Acerto' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Apagar “Acerto”?' });
    expect(deps.savedRolls.answers.callsOf('remove')).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Rolar Acerto' })).toBeNull());
    expect(deps.savedRolls.answers.callsOf('remove')).toEqual([ACERTO.id]);
  });

  it('"Cancelar" keeps it', async () => {
    renderDicePanel(deps);
    await user.click(await screen.findByRole('button', { name: 'Apagar Acerto' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Rolar Acerto' })).toBeInTheDocument();
    expect(deps.savedRolls.answers.callsOf('remove')).toEqual([]);
  });
});

describe('DicePanel — saved rolls before the list', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    openVharnWithRoster(deps);
  });

  it('no saved roll says how to save one', async () => {
    renderDicePanel(deps);
    expect(
      await screen.findByText(
        'Nenhuma rolagem salva. Monte uma e toque no marcador ao lado de Rolar.',
      ),
    ).toBeInTheDocument();
  });

  it('while the list is on its way it says "Carregando…"', () => {
    deps.savedRolls.answers.hold('list');
    renderDicePanel(deps);
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });

  it('a list that fails to load says why', async () => {
    deps.savedRolls.answers.answer('list', { ok: false, failure: { kind: 'offline' } });
    renderDicePanel(deps);
    expect(await screen.findByText(OFFLINE_MESSAGE)).toBeInTheDocument();
  });
});

describe('DicePanel — spectator', () => {
  it('sees only the history: no tray, no saved rolls, no list call', () => {
    const deps = testDependencies();
    openVharnWithRoster(deps);
    renderDicePanel(deps, 'spectator');
    expect(screen.getByRole('heading', { name: 'Histórico' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rolar' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Rolagens salvas' })).toBeNull();
    expect(deps.savedRolls.answers.callsOf('list')).toEqual([]);
  });
});
