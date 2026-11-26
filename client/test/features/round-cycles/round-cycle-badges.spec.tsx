import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { RoundCycleBadges } from '@/features/round-cycles/round-cycle-badges';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import type { RoundCycleDto } from '@lorkarium/contracts';
import { VHARN } from '../../support/campaigns-api-fake';
import { tableSynced } from '../../support/character-fixtures';
import { MOON_ID, MOON_PHASE_IDS, moonCycle } from '../../support/round-cycle-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { VHARN_GRID, vharnBoard } from '../../support/table-session-fixtures';

const IMAGE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('RoundCycleBadges', () => {
  let board: StoreApi<BoardStore>;
  let characters: StoreApi<CharactersStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard() });
    characters = createCharactersStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => String(failure),
    });
  });

  function renderWith(...cycles: RoundCycleDto[]): void {
    characters.getState().apply(tableSynced(3, [], [], cycles));
    render(<RoundCycleBadges board={board} characters={characters} interaction={interaction} />);
  }

  it('shows the phase of this round, the cycle and round, and the next phase', () => {
    renderWith(moonCycle({ current: 1, round: 2 }));
    const badge = screen.getByRole('group', { name: 'Fases da Lua' });
    expect(badge).toHaveTextContent('Fases da Lua · rodada 2');
    expect(badge).toHaveTextContent('Crescente');
    expect(badge).toHaveTextContent('PróximaLua Cheia');
  });

  it('who may not choose sees the next phase without a button', () => {
    renderWith(moonCycle({ canChoose: false }));
    expect(screen.queryByRole('button', { name: /próxima/i })).not.toBeInTheDocument();
  });

  it('a chooser opens the phase of the next round and picks Lua Nova', async () => {
    renderWith(moonCycle({ current: 1, round: 2, canChoose: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Próxima: Lua Cheia' }));
    const picker = screen.getByRole('dialog', { name: 'Fase da rodada 3' });

    await userEvent.click(within(picker).getByRole('button', { name: /Lua Nova/ }));

    expect(commands.sent.at(-1)).toEqual({
      name: 'chooseNextPhase',
      campaignId: VHARN_GRID.campaignId,
      sceneId: VHARN_GRID.sceneId,
      fields: { cycleId: MOON_ID, phaseId: MOON_PHASE_IDS[0] },
    });
  });

  it('the list tags repeating the current phase and the one the cycle goes to', async () => {
    renderWith(moonCycle({ current: 1, canChoose: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Próxima: Lua Cheia' }));
    const picker = screen.getByRole('dialog');
    expect(within(picker).getByRole('button', { name: /Crescente/ })).toHaveTextContent(
      'repetir a atual',
    );
    expect(within(picker).getByRole('button', { name: /Lua Cheia/ })).toHaveTextContent(
      'segue o ciclo',
    );
  });

  it('picking the phase the cycle goes to anyway sends null (follow the cycle)', async () => {
    renderWith(moonCycle({ current: 1, chosen: 0, canChoose: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Próxima · escolhida: Lua Nova' }));

    await userEvent.click(screen.getByRole('button', { name: /Lua Cheia/ }));

    expect(commands.sent.at(-1)?.fields).toEqual({ cycleId: MOON_ID, phaseId: null });
  });

  it('a refused pick keeps the list open and says why on the status line', async () => {
    commands.answerWith({ ok: false, failure: 'cycle_not_active' });
    renderWith(moonCycle({ canChoose: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Próxima: Crescente' }));

    await userEvent.click(screen.getByRole('button', { name: /Lua Cheia/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(interaction.getState().notice).toBe('cycle_not_active');
  });

  it('a phase with an image shows it; one without shows no broken image', () => {
    const cycle = moonCycle();
    const phases = cycle.phases.map((phase, i) =>
      i === 0 ? { ...phase, imageAssetId: IMAGE_ID } : phase,
    );
    renderWith({ ...cycle, phases });
    const images = screen.getByRole('group', { name: 'Fases da Lua' }).querySelectorAll('img');
    expect([...images].map((img) => img.getAttribute('src'))).toEqual([`/api/assets/${IMAGE_ID}`]);
  });

  it('two cycles in this combat give two badges; one in another grid gives none', () => {
    const elsewhere = moonCycle({
      id: crypto.randomUUID(),
      name: 'Céu',
      sceneId: crypto.randomUUID(),
    });
    renderWith(moonCycle(), moonCycle({ id: crypto.randomUUID(), name: 'Maré' }), elsewhere);
    expect(screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual([
      'Fases da Lua',
      'Maré',
    ]);
  });
});
