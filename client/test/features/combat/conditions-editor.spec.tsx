import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TokenDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { ConditionSummary } from '@/features/combat/condition-marks';
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
} from '../../support/table-session-fixtures';

const ENVENENADO = activeCondition();
const CONCENTRANDO = activeCondition({
  id: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
  conditionId: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
  name: 'Concentrando',
  tone: 'benefit',
  remainingRounds: null,
});
const DEFINITIONS = [
  { id: ENVENENADO.conditionId, name: 'Envenenado', tone: 'harm' },
  { id: CONCENTRANDO.conditionId, name: 'Concentrando', tone: 'benefit' },
] as const;

describe('ConditionsEditor', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
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

  it('lists the active conditions in text with their rounds', () => {
    renderEditor();
    expect(section()).toHaveTextContent('Envenenado · 2 rod.');
    expect(section()).toHaveTextContent('Concentrando · sem limite');
  });

  it('"Remover Envenenado" sends condition:remove', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Remover Envenenado' }));
    expect(commands.sentAs('removeCondition')).toEqual([
      {
        name: 'removeCondition',
        campaignId: VHARN.id,
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

  it('a click on a suggestion takes it', async () => {
    renderEditor(lyra());
    await userEvent.click(nameField());
    await userEvent.click(screen.getByRole('option', { name: 'Concentrando' }));
    expect(nameField()).toHaveValue('Concentrando');
  });

  it('with no condition it reads "Nenhuma"', () => {
    renderEditor(lyra());
    expect(within(section()).getByText('Nenhuma')).toBeInTheDocument();
  });

  it('the master creates "Sangrando" and it is applied right after', async () => {
    renderEditor(lyra(), true);
    await userEvent.type(nameField(), 'Sangrando');
    expect(screen.getByRole('group', { name: 'Natureza' })).toBeInTheDocument();
    commands.hold();
    await userEvent.click(screen.getByRole('button', { name: 'Criar e aplicar' }));
    const definition = {
      id: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
      name: 'Sangrando',
      tone: 'harm',
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

  it('a player typing a name not on the list cannot apply it and is told why', async () => {
    renderEditor(lyra(), false);
    await userEvent.type(nameField(), 'Sangrando');
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    expect(screen.getByText('Só o mestre cria condição nova.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Natureza' })).toBeNull();
  });

  it('without canControl it is read only', () => {
    renderEditor(lyra({ canControl: false, conditions: [ENVENENADO] }));
    expect(screen.queryByRole('button', { name: 'Remover Envenenado' })).toBeNull();
    expect(screen.queryByLabelText('Adicionar condição')).toBeNull();
  });
});

describe('ConditionSummary', () => {
  it('lists the names in one line with the total for screen readers', () => {
    render(<ConditionSummary conditions={[ENVENENADO, CONCENTRANDO]} />);
    expect(screen.getByText('2 condições:', { exact: false })).toHaveClass('sr-only');
    expect(screen.getByText('Envenenado, Concentrando')).toHaveClass('truncate');
  });

  it('renders nothing with no condition', () => {
    const { container } = render(<ConditionSummary conditions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
