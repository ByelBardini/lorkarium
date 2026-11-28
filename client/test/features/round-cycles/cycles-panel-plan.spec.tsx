import { PLAN_LIMITS, type PlanLimits, type RoundCycleDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { CyclesPanel } from '@/features/round-cycles/cycles-panel';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { lyraCharacter, tableSynced } from '../../support/character-fixtures';
import { moonCycle } from '../../support/round-cycle-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { onTablePlan } from '../../support/table-plan';
import { VHARN_GRID, vharnBoard, vharnState } from '../../support/table-session-fixtures';

const CONFIG = { holder: { kind: 'table' }, visibility: 'everyone', seerIds: [], chooserIds: [] };

describe('CyclesPanel and the plan of the table', () => {
  let board: StoreApi<BoardStore>;
  let characters: StoreApi<CharactersStore>;
  let presence: StoreApi<TablePresenceStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard() });
    characters = createCharactersStore(VHARN.id, () => undefined);
    presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState() });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: String,
    });
  });

  function renderOn(limits: PlanLimits, ...cycles: RoundCycleDto[]): void {
    characters.getState().apply(tableSynced(3, [lyraCharacter()], [], cycles));
    const images = { campaignId: VHARN.id, assets: new AssetsApiFake() };
    const panel = (
      <CyclesPanel
        table={{ characters, board, presence }}
        interaction={interaction}
        images={images}
      />
    );
    render(onTablePlan(limits, panel));
  }

  const savedMoon = (overrides: Partial<RoundCycleDto> = {}): RoundCycleDto => ({
    ...moonCycle({ config: { ...CONFIG } as RoundCycleDto['config'] }),
    ...overrides,
  });

  it('a Grátis table with its one cycle does not open "Novo ciclo", and says why', async () => {
    renderOn(PLAN_LIMITS.free, savedMoon());
    const create = screen.getByRole('button', { name: 'Novo ciclo' });

    expect(create).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(create);
    expect(screen.queryByRole('dialog', { name: 'Novo ciclo' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Grátis');
  });

  it('a cycle kept past the plan shows "Só leitura" and does not open its editor', async () => {
    renderOn(PLAN_LIMITS.free, savedMoon({ planLocked: true }));

    expect(screen.getByRole('img', { name: 'Só leitura' })).toBeInTheDocument();
    const edit = screen.getByRole('button', { name: 'Editar Fases da Lua' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(edit);
    expect(screen.queryByRole('dialog', { name: 'Editar ciclo' })).toBeNull();
  });

  it('a locked cycle can still be deleted', async () => {
    renderOn(PLAN_LIMITS.free, savedMoon({ planLocked: true }));

    await userEvent.click(screen.getByRole('button', { name: 'Apagar Fases da Lua' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar: apagar Fases da Lua' }));

    expect(commands.sent.at(-1)?.name).toBe('deleteRoundCycle');
  });

  it('on Grátis a new cycle counts to 3 phases, takes icons only, and sends them', async () => {
    renderOn(PLAN_LIMITS.free);
    await userEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }));
    const dialog = screen.getByRole('dialog', { name: 'Novo ciclo' });
    expect(dialog).toHaveTextContent('2 de 3');

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar fase' }));

    expect(dialog).toHaveTextContent('3 de 3');
    expect(screen.getByRole('button', { name: 'Adicionar fase' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByRole('button', { name: /^Imagem ou GIF da fase/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Ícone:/ })).toHaveLength(3);
    expect(dialog).toHaveTextContent('Imagem ou GIF próprio: disponível no plano Narrador');

    await userEvent.type(screen.getByLabelText('Nome'), 'Maré');
    for (const [i, name] of ['Baixa', 'Subindo', 'Alta'].entries()) {
      await userEvent.type(screen.getByRole('textbox', { name: `Nome da fase ${i + 1}` }), name);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ciclo' }));
    expect(commands.sent.at(-1)).toMatchObject({
      name: 'defineRoundCycle',
      fields: {
        phases: [
          { name: 'Baixa', icon: 'game-icons:cycle', imageAssetId: null },
          { name: 'Subindo', icon: 'game-icons:cycle', imageAssetId: null },
          { name: 'Alta', icon: 'game-icons:cycle', imageAssetId: null },
        ],
      },
    });
  });

  it('on Narrador a new cycle counts to 6 phases and keeps the image square', async () => {
    renderOn(PLAN_LIMITS.narrador);
    await userEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }));

    expect(screen.getByRole('dialog', { name: 'Novo ciclo' })).toHaveTextContent('2 de 6');
    expect(screen.getAllByRole('button', { name: /^Imagem ou GIF da fase/ })).toHaveLength(2);
  });
});
