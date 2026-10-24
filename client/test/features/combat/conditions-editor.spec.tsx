import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TokenDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { ConditionsEditor } from '@/features/combat/conditions-editor';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  LYRA_ID,
  activeCondition,
  eventAt,
  lyra,
  vharnBoard,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const ENVENENADO = activeCondition();
const CONCENTRANDO = activeCondition({
  id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
  conditionId: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
  name: 'Concentrando',
  tone: 'benefit',
  icon: 'crosshair',
  remainingRounds: null,
});
const DEFINITIONS = [
  {
    id: ENVENENADO.conditionId,
    name: 'Envenenado',
    tone: 'harm',
    icon: 'skull',
    color: null,
    look: null,
    description: '',
    maxStacks: null,
  },
  {
    id: CONCENTRANDO.conditionId,
    name: 'Concentrando',
    tone: 'benefit',
    icon: 'sparkles',
    color: null,
    look: null,
    description: '',
    maxStacks: null,
  },
  {
    id: 'c9d8e7f6-a5b4-4c3d-8e2f-1a0b9c8d7e6f',
    name: 'Paralisado',
    tone: 'incapacitating',
    icon: 'lock',
    color: null,
    look: null,
    description: '',
    maxStacks: null,
  },
] as const;

describe('ConditionsEditor', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: String,
    });
  });

  function renderEditor(
    token: TokenDto = lyra({ conditions: [ENVENENADO, CONCENTRANDO] }),
    isMaster = false,
  ): void {
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({ tokens: [token], conditionDefinitions: [...DEFINITIONS] }),
    });
    render(
      <ConditionsEditor
        token={token}
        board={board}
        interaction={interaction}
        isMaster={isMaster}
      />,
    );
  }

  function section(): HTMLElement {
    return screen.getByRole('region', { name: 'Condições de Lyra' });
  }

  it('lists the active conditions as tags with their rounds, "∞" read as "sem limite"', () => {
    renderEditor();
    const tags = within(screen.getByRole('list', { name: 'Condições ativas de Lyra' }));
    const rows = tags.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Envenenado2, 2 rodadas',
      'Concentrando∞, sem limite',
    ]);
    expect(within(rows[1]!).getByText('∞')).toHaveAttribute('aria-hidden', 'true');
  });

  it('"Mais uma rodada de Envenenado" sends condition:setRounds with 3', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Mais uma rodada de Envenenado' }));

    expect(commands.sentAs('setConditionRounds').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, activeConditionId: ENVENENADO.id, rounds: 3 },
    ]);
  });

  it('"Menos uma rodada de Envenenado" sends 1', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Menos uma rodada de Envenenado' }));

    expect(commands.sentAs('setConditionRounds').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, activeConditionId: ENVENENADO.id, rounds: 1 },
    ]);
  });

  it('a condition without limit has no − nor +', () => {
    renderEditor();

    expect(screen.queryByRole('button', { name: 'Menos uma rodada de Concentrando' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mais uma rodada de Concentrando' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remover Concentrando' })).toBeInTheDocument();
  });

  it('at 1 round "Menos uma rodada" is off', () => {
    renderEditor(lyra({ conditions: [{ ...ENVENENADO, remainingRounds: 1 }] }));

    expect(screen.getByRole('button', { name: 'Menos uma rodada de Envenenado' })).toBeDisabled();
  });

  it('a refused + says why on the status line and keeps the confirmed rounds', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Mais uma rodada de Envenenado' }));

    expect(interaction.getState().notice).toBe('forbidden');
    expect(screen.getByRole('list', { name: 'Condições ativas de Lyra' })).toHaveTextContent(
      'Envenenado2, 2 rodadas',
    );
  });

  it('"Mais um stack de Envenenado" sends condition:setStacks with 4', async () => {
    renderEditor(lyra({ conditions: [{ ...ENVENENADO, maxStacks: 5, stacks: 3 }] }));

    await userEvent.click(screen.getByRole('button', { name: 'Mais um stack de Envenenado' }));

    expect(commands.sentAs('setConditionStacks')).toEqual([
      {
        name: 'setConditionStacks',
        ...VHARN_GRID,
        fields: { tokenId: LYRA_ID, activeConditionId: ENVENENADO.id, stacks: 4 },
      },
    ]);
  });

  it('"Menos um stack de Envenenado" sends 2', async () => {
    renderEditor(lyra({ conditions: [{ ...ENVENENADO, maxStacks: 5, stacks: 3 }] }));

    await userEvent.click(screen.getByRole('button', { name: 'Menos um stack de Envenenado' }));

    expect(commands.sentAs('setConditionStacks').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, activeConditionId: ENVENENADO.id, stacks: 2 },
    ]);
  });

  it('a refused stack says why on the status line and keeps the confirmed count', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    renderEditor(lyra({ conditions: [{ ...ENVENENADO, maxStacks: 5, stacks: 3 }] }));

    await userEvent.click(screen.getByRole('button', { name: 'Mais um stack de Envenenado' }));

    expect(interaction.getState().notice).toBe('forbidden');
    expect(screen.getByRole('list', { name: 'Condições ativas de Lyra' })).toHaveTextContent(
      'Envenenado×3, 3 stacks',
    );
  });

  it('"Remover Envenenado" sends condition:remove', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Remover Envenenado' }));
    expect(commands.sentAs('removeCondition')).toEqual([
      {
        name: 'removeCondition',
        ...VHARN_GRID,
        fields: { tokenId: LYRA_ID, activeConditionId: ENVENENADO.id },
      },
    ]);
  });

  function nameField(): HTMLElement {
    return screen.getByRole('combobox', { name: 'Adicionar condição' });
  }

  it('"Adicionar condição" is typed, any case or accent, and sends condition:apply, 0 meaning no limit', async () => {
    renderEditor(lyra());
    await userEvent.type(nameField(), 'concentrando');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await userEvent.type(nameField(), 'Concentrando');
    await userEvent.clear(screen.getByLabelText('Rodadas'));
    await userEvent.type(screen.getByLabelText('Rodadas'), '3x');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(commands.sentAs('applyCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, conditionId: CONCENTRANDO.conditionId, rounds: 0 },
      { tokenId: LYRA_ID, conditionId: CONCENTRANDO.conditionId, rounds: 3 },
    ]);
  });

  it('the confirmed apply empties the name', async () => {
    renderEditor(lyra());
    await userEvent.type(nameField(), 'Envenenado{Enter}');
    expect(commands.sentAs('applyCondition')).toHaveLength(1);
    expect(nameField()).toHaveValue('');
  });

  it('the suggestions follow what is typed; ↓ and Enter take one', async () => {
    renderEditor(lyra());
    await userEvent.type(nameField(), 'ven');
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Envenenado']);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(nameField()).toHaveValue('Envenenado');
    expect(commands.sent).toEqual([]);
  });

  it('the suggestions are grouped by nature: benefits, then incapacitating, then harms', async () => {
    renderEditor(lyra());
    await userEvent.click(nameField());
    const groups = screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'));
    expect(groups).toEqual(['Benéficas', 'Incapacitantes', 'Prejudiciais']);
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Concentrando', 'Paralisado', 'Envenenado']);
  });

  it('a new name with nothing alike opens no list over the icon and nature', async () => {
    renderEditor(lyra(), true);
    await userEvent.type(nameField(), 'Sangrando');
    expect(nameField()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a click on a suggestion takes it', async () => {
    renderEditor(lyra());
    await userEvent.click(nameField());
    await userEvent.click(screen.getByRole('option', { name: 'Concentrando' }));
    expect(nameField()).toHaveValue('Concentrando');
  });

  it('each active condition shows its own icon, colored by its nature', () => {
    renderEditor();
    const active = section().querySelector('ul:not([role=listbox])');
    const icons = [...(active?.querySelectorAll('svg[data-icon]') ?? [])];
    expect(icons.map((icon) => icon.getAttribute('data-icon'))).toEqual([
      'flask-conical',
      'crosshair',
    ]);
    expect(icons[0]).toHaveClass('text-destructive');
    expect(icons[1]).toHaveClass('text-primary');
  });

  it('the master picks the icon of a new condition and it goes with the definition', async () => {
    renderEditor(lyra(), true);
    await userEvent.type(nameField(), 'Sangrando');
    await userEvent.click(screen.getByRole('button', { name: 'Ícone: Marca' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Gota' }));
    expect(screen.queryByRole('radiogroup', { name: 'Ícone' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ícone: Gota' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar e aplicar' }));
    expect(commands.sentAs('defineCondition')[0]?.fields).toEqual({
      name: 'Sangrando',
      tone: 'harm',
      icon: 'droplet',
      color: null,
      look: null,
    });
  });

  it('a name already on the list offers no icon choice', async () => {
    renderEditor(lyra(), true);
    await userEvent.type(nameField(), 'Envenenado');
    expect(screen.queryByRole('button', { name: /^Ícone/ })).toBeNull();
  });

  it('with no condition it reads "Nenhuma"', () => {
    renderEditor(lyra());
    expect(within(section()).getByText('Nenhuma')).toBeInTheDocument();
  });

  it('the master creates "Sangrando" and it is applied right after', async () => {
    renderEditor(lyra(), true);
    await userEvent.type(nameField(), 'Sangrando');
    expect(screen.getByRole('radiogroup', { name: 'Natureza' })).toBeInTheDocument();
    commands.hold();
    await userEvent.click(screen.getByRole('button', { name: 'Criar e aplicar' }));
    const definition = {
      id: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
      name: 'Sangrando',
      tone: 'harm',
      icon: 'droplet',
      color: null,
      look: null,
      description: '',
      maxStacks: null,
    } as const;
    act(() =>
      board.getState().apply({
        kind: 'boardEvent',
        event: eventAt(5, { type: 'conditionDefined', payload: { definition } }),
      }),
    );
    await act(async () => commands.release());
    expect(commands.sent.map(({ name }) => name)).toEqual(['defineCondition', 'applyCondition']);
    expect(commands.sentAs('applyCondition')[0]?.fields).toEqual({
      tokenId: LYRA_ID,
      conditionId: definition.id,
      rounds: 0,
    });
  });

  it('a new name shows the three natures and "Aparência no token", which start on Prejudicial and Nenhuma', async () => {
    renderEditor(lyra(), true);
    await userEvent.type(nameField(), 'Inconsciente');
    const natures = within(screen.getByRole('radiogroup', { name: 'Natureza' }));
    expect(natures.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Benéfica',
      'Prejudicial',
      'Incapacitante',
    ]);
    expect(natures.getByRole('radio', { name: 'Prejudicial' })).toBeChecked();
    const looks = within(screen.getByRole('radiogroup', { name: 'Aparência no token' }));
    expect(looks.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Nenhuma',
      'Translúcido',
      'Desacordado',
    ]);
    expect(looks.getByRole('radio', { name: 'Nenhuma' })).toBeChecked();
  });

  it('the master creates "Inconsciente" incapacitating and unconscious in one define, then applies it', async () => {
    renderEditor(lyra(), true);
    await userEvent.type(nameField(), 'Inconsciente');
    await userEvent.click(screen.getByRole('radio', { name: 'Incapacitante' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Desacordado' }));
    commands.hold();
    await userEvent.click(screen.getByRole('button', { name: 'Criar e aplicar' }));
    const definition = {
      id: 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d',
      name: 'Inconsciente',
      tone: 'incapacitating',
      icon: 'circle-dot',
      color: null,
      look: 'unconscious',
      description: '',
      maxStacks: null,
    } as const;
    act(() =>
      board.getState().apply({
        kind: 'boardEvent',
        event: eventAt(5, { type: 'conditionDefined', payload: { definition } }),
      }),
    );
    await act(async () => commands.release());
    expect(commands.sentAs('defineCondition').map(({ fields }) => fields)).toEqual([
      { name: 'Inconsciente', tone: 'incapacitating', icon: 'circle-dot', look: 'unconscious' },
    ]);
    expect(commands.sentAs('applyCondition')[0]?.fields).toMatchObject({
      conditionId: definition.id,
    });
  });

  it('a refused define says why on the status line and applies nothing', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    renderEditor(lyra(), true);
    await userEvent.type(nameField(), 'Inconsciente');
    await userEvent.click(screen.getByRole('button', { name: 'Criar e aplicar' }));
    expect(interaction.getState().notice).toBe('forbidden');
    expect(commands.sentAs('applyCondition')).toEqual([]);
  });

  it('read-only, an incapacitating condition on the token reads its name next to a filled tag', () => {
    const paralisado = activeCondition({
      name: 'Paralisado',
      tone: 'incapacitating',
      icon: 'lock',
    });
    act(() => interaction.getState().setReadOnly(true));
    renderEditor(lyra({ conditions: [paralisado] }));
    const tag = within(screen.getByRole('list', { name: 'Condições de Lyra' })).getByRole(
      'listitem',
    );
    expect(tag).toHaveTextContent('Paralisado');
    expect(tag).toHaveClass('bg-destructive/15');
  });

  it('a player typing a name not on the list cannot apply it and is told why', async () => {
    renderEditor(lyra(), false);
    await userEvent.type(nameField(), 'Sangrando');
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(screen.getByText('Só o mestre cria condição nova.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Natureza' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Aparência no token' })).toBeNull();
  });

  it('a player sees −, + and × and the picker on a token they do not control', async () => {
    renderEditor(lyra({ canControl: false, conditions: [ENVENENADO] }));

    expect(screen.getByRole('list', { name: 'Condições ativas de Lyra' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Adicionar condição' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover Envenenado' }));
    expect(commands.sentAs('removeCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, activeConditionId: ENVENENADO.id },
    ]);
  });

  it('read-only (a spectator) shows the tags only: no button, no picker, even on a controlled token', () => {
    act(() => interaction.getState().setReadOnly(true));
    renderEditor(lyra({ canControl: true, conditions: [ENVENENADO] }));

    expect(screen.getByRole('list', { name: 'Condições de Lyra' })).toHaveTextContent('Envenenado');
    expect(screen.queryByRole('button', { name: /Envenenado/ })).toBeNull();
    expect(screen.queryByLabelText('Adicionar condição')).toBeNull();
  });
});
