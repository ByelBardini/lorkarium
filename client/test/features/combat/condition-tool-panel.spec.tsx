import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConditionDefinitionDto } from '@lorkarium/contracts';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { ConditionToolPanel } from '@/features/combat/condition-tool-panel';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createConditionToolStore, type ConditionToolStore } from '@/stores/condition-tool-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { vharnBoard } from '../../support/table-session-fixtures';

function definition(
  name: string,
  tone: ConditionDefinitionDto['tone'],
  description = '',
): ConditionDefinitionDto {
  return {
    id: `def-${name}`,
    name,
    tone,
    icon: 'circle-dot',
    color: null,
    look: null,
    description,
    maxStacks: null,
  };
}

const ENVENENADO = definition('Envenenado', 'harm', 'Desvantagem em ataques.');
const ABENCOADO = definition('Abençoado', 'benefit');
const PARALISADO = definition('Paralisado', 'incapacitating');

describe('ConditionToolPanel', () => {
  let board: StoreApi<BoardStore>;
  let conditionTool: StoreApi<ConditionToolStore>;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    conditionTool = createConditionToolStore();
  });

  function renderPanel(
    definitions: readonly ConditionDefinitionDto[] = [ENVENENADO, ABENCOADO, PARALISADO],
    isMaster = true,
  ): HTMLElement {
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({ conditionDefinitions: [...definitions] }),
    });
    render(
      <MemoryRouter>
        <ConditionToolPanel
          board={board}
          conditionTool={conditionTool}
          campaignId={VHARN.id}
          isMaster={isMaster}
        />
      </MemoryRouter>,
    );
    return screen.getByRole('region', { name: 'Aplicar condição' });
  }

  function listbox(): HTMLElement {
    return screen.getByRole('listbox', { name: 'Condições da mesa' });
  }

  it("lists the table's conditions by nature, each with its description", () => {
    renderPanel();
    const groups = within(listbox())
      .getAllByRole('group')
      .map((group) => group.getAttribute('aria-label'));
    expect(groups).toEqual(['Benéficas', 'Incapacitantes', 'Prejudiciais']);
    expect(screen.getByRole('option', { name: 'Envenenado' })).toHaveAccessibleDescription(
      'Desvantagem em ataques.',
    );
  });

  it('a click on a condition picks it for the tool', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('option', { name: 'Envenenado' }));
    expect(conditionTool.getState().conditionId).toBe(ENVENENADO.id);
    expect(screen.getByRole('option', { name: 'Envenenado' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('↓ and ↑ on the focused list step through the conditions in the shown order', async () => {
    renderPanel();
    listbox().focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(conditionTool.getState().conditionId).toBe(ABENCOADO.id);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(conditionTool.getState().conditionId).toBe(ENVENENADO.id);
    await userEvent.keyboard('{ArrowUp}');
    expect(conditionTool.getState().conditionId).toBe(PARALISADO.id);
    expect(listbox()).toHaveAttribute('aria-activedescendant', expect.stringMatching(/-1$/));
  });

  it('"Rodadas" keeps what is typed in the tool', async () => {
    renderPanel();
    await userEvent.type(screen.getByLabelText('Rodadas'), '2');
    expect(conditionTool.getState().roundsText).toBe('2');
    expect(screen.getByLabelText('Rodadas')).not.toHaveAttribute('aria-invalid');
  });

  it.each(['abc', '100'])('"Rodadas" %s is marked invalid with "De 0 a 99"', async (typed) => {
    renderPanel();
    await userEvent.type(screen.getByLabelText('Rodadas'), typed);
    expect(screen.getByLabelText('Rodadas')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Rodadas')).toHaveAccessibleDescription('De 0 a 99');
  });

  it('says how Shift takes a condition off', () => {
    expect(renderPanel()).toHaveTextContent('Shift+clique tira a condição.');
  });

  it('a table without conditions says so and the master gets "Configurar condições"', () => {
    const panel = renderPanel([]);
    expect(panel).toHaveTextContent('A mesa não tem condições.');
    expect(within(panel).getByRole('link', { name: 'Configurar condições' })).toHaveAttribute(
      'href',
      `/campaigns/${VHARN.id}/table/conditions`,
    );
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByLabelText('Rodadas')).toBeNull();
  });

  it('a player at a table without conditions gets no link', () => {
    const panel = renderPanel([], false);
    expect(panel).toHaveTextContent('A mesa não tem condições.');
    expect(within(panel).queryByRole('link')).toBeNull();
  });
});
