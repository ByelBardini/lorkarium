import { act, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { savedRollPartsOf } from '@/lib/dice-tray';
import { VHARN } from '../../support/campaigns-api-fake';
import { openVharnChat, renderChatPanel, vharnChat } from '../../support/chat-panel-harness';
import { ACERTO, BENCAO } from '../../support/dice-fixtures';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  duda,
} from '../../support/table-session-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const WINDOW_ASPECT = Math.min(3, Math.max(0.5, window.innerWidth / window.innerHeight));

function field(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Mensagem' });
}

function lastRoll(deps: TestDependencies) {
  return deps.dice.sent.at(-1)?.request;
}

function optionNames(): string[] {
  const list = screen.getByRole('listbox', { name: 'Sugestões' });
  return within(list)
    .getAllByRole('option')
    .map((option) => option.getAttribute('data-value') ?? '');
}

describe('ChatComposer — rolls by command', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(async () => {
    deps = testDependencies();
    user = userEvent.setup();
    deps.savedRolls.rolls.set(VHARN.id, [ACERTO, BENCAO]);
    openVharnChat(deps);
    renderChatPanel(deps);
    await act(() => Promise.resolve());
  });

  it('/r 1d20+5 rolls for the whole table through dice:roll and sends no message', async () => {
    await user.type(field(), '/r 1d20+5{Enter}');
    expect(lastRoll(deps)).toEqual({
      label: null,
      parts: [{ label: null, expression: '1d20+5' }],
      visibility: 'public',
      aspect: WINDOW_ASPECT,
    });
    expect(deps.chat.sent).toEqual([]);
    expect(field()).toHaveValue('');
  });

  it('/gr 2d6 rolls only for the master', async () => {
    await user.type(field(), '/gr 2d6{Enter}');
    expect(lastRoll(deps)?.visibility).toBe('masters');
  });

  it('/acerto rolls the saved "Acerto" with its parts and name', async () => {
    await user.type(field(), '/acerto{Escape}{Enter}');
    expect(lastRoll(deps)).toMatchObject({
      label: 'Acerto',
      parts: savedRollPartsOf(ACERTO),
      visibility: 'public',
    });
  });

  it('a notation the server cannot read keeps the draft and says what is missing', async () => {
    deps.dice.answer = {
      ok: false,
      failure: {
        kind: 'invalid_expression',
        message: 'Expected the number of sides at position 2; got the end of the expression.',
      },
    };
    await user.type(field(), '/r 1d{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Faltou o número de faces.');
    expect(field()).toHaveValue('/r 1d');
  });

  it('a roll refused for the rate says the dice tab’s message', async () => {
    deps.dice.answer = { ok: false, failure: { kind: 'rate_limited', retryAfterSeconds: 1 } };
    await user.type(field(), '/r 1d20{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Muitas rolagens seguidas. Espere 1 s.');
  });

  it('an unknown command is refused under the field and nothing goes', async () => {
    await user.type(field(), '/xyz{Escape}{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Não existe o comando /xyz.');
    expect(deps.dice.sent).toEqual([]);
    expect(deps.chat.sent).toEqual([]);
  });

  it('/w Caio text whispers to Caio at the Table', async () => {
    await user.type(field(), '/w Caio psiu{Enter}');
    expect(deps.chat.sent.at(-1)?.request).toEqual({
      channel: { kind: 'table', whisperTo: CAIO_AT_TABLE.userId },
      speaker: { kind: 'self' },
      text: 'psiu',
    });
  });

  it('/w to someone offline is refused with who would not get it', async () => {
    await user.type(field(), '/w Bia volta{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bia está offline: a mensagem não chegaria.',
    );
    expect(deps.chat.sent).toEqual([]);
  });
});

describe('ChatComposer — suggestions', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(async () => {
    deps = testDependencies();
    user = userEvent.setup();
    deps.savedRolls.rolls.set(VHARN.id, [ACERTO, BENCAO]);
    openVharnChat(deps);
    renderChatPanel(deps);
    await act(() => Promise.resolve());
  });

  it('"/" lists the commands and the saved rolls, and typing filters them', async () => {
    await user.type(field(), '/');
    expect(field()).toHaveAttribute('aria-expanded', 'true');
    expect(optionNames()).toEqual(['/r', '/gr', '/w', '/acerto', '/bencao']);
    await user.type(field(), 'be');
    expect(optionNames()).toEqual(['/bencao']);
  });

  it('arrows move, Enter takes the suggestion, and Esc closes the list', async () => {
    await user.type(field(), '/');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    const active = field().getAttribute('aria-activedescendant');
    expect(active && document.getElementById(active)).toHaveAttribute('data-value', '/acerto');
    await user.keyboard('{Enter}');
    expect(field()).toHaveValue('/acerto');
    expect(deps.dice.sent).toEqual([]);
    await user.clear(field());
    await user.type(field(), '/');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Sugestões' })).toBeNull();
    expect(field()).toHaveAttribute('aria-expanded', 'false');
  });

  it('taking a fixed command leaves the space for what follows it', async () => {
    await user.type(field(), '/g');
    await user.keyboard('{Enter}');
    expect(field()).toHaveValue('/gr ');
    await user.type(field(), '1d6{Enter}');
    expect(deps.dice.sent.at(-1)?.request.parts).toEqual([{ label: null, expression: '1d6' }]);
  });

  it('after a saved roll is taken, the next Enter rolls it', async () => {
    await user.type(field(), '/ace');
    await user.keyboard('{Enter}');
    expect(field()).toHaveValue('/acerto');
    await user.keyboard('{Enter}');
    expect(deps.dice.sent.map(({ request }) => request.label)).toEqual(['Acerto']);
  });

  it('"@" lists the others and Enter writes the mention', async () => {
    await user.type(field(), 'Olha @');
    expect(optionNames()).toEqual(['@Caio', '@Bia']);
    await user.type(field(), 'bi{Enter}');
    expect(field()).toHaveValue('Olha @Bia ');
    expect(deps.chat.sent).toEqual([]);
  });

  // Regression: command examples wrapped into a dense tutorial under the field (2026-10-28).
  it('command examples stay in the shortcuts help until it is opened', async () => {
    expect(screen.queryByText('/r 1d20+5', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByTestId('composer-hint')).not.toHaveTextContent('Enter envia');
    await user.click(screen.getByRole('button', { name: 'Atalhos do chat' }));
    const help = screen.getByRole('dialog', { name: 'Atalhos do chat' });
    expect(help).toHaveTextContent('/r 1d20+5');
    expect(help).toHaveTextContent('/gr 2d6');
    expect(help).toHaveTextContent('/w nome mensagem');
    expect(help).toHaveTextContent('/rolagem-salva');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Atalhos do chat' })).not.toBeInTheDocument();
  });

  it('in a direct, "/" offers no roll and the hint does not mention /r', async () => {
    act(() => {
      vharnChat(deps)
        .getState()
        .startConversation({ kind: 'direct', userId: CAIO_AT_TABLE.userId });
    });
    await user.click(screen.getByRole('button', { name: 'Caio' }));
    await user.type(field(), '/');
    expect(screen.queryByRole('listbox', { name: 'Sugestões' })).toBeNull();
    expect(screen.getByTestId('composer-hint')).not.toHaveTextContent('/r');
    await user.click(screen.getByRole('button', { name: 'Atalhos do chat' }));
    const help = screen.getByRole('dialog', { name: 'Atalhos do chat' });
    expect(help).not.toHaveTextContent('/r');
    expect(help).not.toHaveTextContent('/w');
    expect(help).toHaveTextContent('@nome');
  });
});

describe('ChatComposer — who only watches', () => {
  it('a spectator’s /r is refused, and the hint and the list offer no roll', async () => {
    const deps = testDependencies();
    const user = userEvent.setup();
    openVharnChat(deps, { members: [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE, duda()] });
    renderChatPanel(deps, 'spectator');
    expect(screen.getByTestId('composer-hint')).not.toHaveTextContent('/r');
    await user.type(field(), '/');
    expect(optionNames()).toEqual(['/w']);
    await user.type(field(), 'r 1d20{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Quem assiste à mesa não rola dados.');
    expect(deps.dice.sent).toEqual([]);
  });
});
