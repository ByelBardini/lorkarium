import type { RoundCyclesAnnouncedDto } from '@lorkarium/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  CYCLE_ANNOUNCEMENT_MS,
  CycleAnnouncement,
} from '@/features/round-cycles/cycle-announcement';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { tableSynced } from '../../support/character-fixtures';
import { MOON_ID } from '../../support/round-cycle-fixtures';
import { VHARN_SCENE, vharnBoard } from '../../support/table-session-fixtures';

const IMAGE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function announced(round: number, sceneId: string = VHARN_SCENE.id): RoundCyclesAnnouncedDto {
  return {
    campaignId: VHARN.id,
    sceneId,
    round,
    at: `2026-11-25T21:0${round}:00.000Z`,
    announcements: [
      {
        cycleId: MOON_ID,
        cycleName: 'Fases da Lua',
        phase: { name: 'Lua Cheia', imageAssetId: IMAGE_ID },
      },
    ],
  };
}

describe('CycleAnnouncement', () => {
  let board: StoreApi<BoardStore>;
  let characters: StoreApi<CharactersStore>;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard() });
    characters = createCharactersStore(VHARN.id, () => undefined);
    characters.getState().apply(tableSynced(3, [], []));
    render(<CycleAnnouncement board={board} characters={characters} />);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function announce(event: RoundCyclesAnnouncedDto): void {
    act(() => characters.getState().apply({ kind: 'roundCyclesAnnounced', event }));
  }

  it('shows the round that began, the phase image and name, and the cycle', () => {
    announce(announced(4));
    const card = screen.getByRole('status', { name: 'Rodada 4 começou' });
    expect(card).toHaveTextContent('Rodada 4 começou');
    expect(card).toHaveTextContent('Lua Cheia');
    expect(card).toHaveTextContent('Fases da Lua');
    expect(card.querySelector('img')?.getAttribute('src')).toBe(`/api/assets/${IMAGE_ID}`);
  });

  it('"Entendi" closes it, and the next round shows again', () => {
    announce(announced(4));
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    announce(announced(5));
    expect(screen.getByRole('status', { name: 'Rodada 5 começou' })).toBeInTheDocument();
  });

  it('it goes by itself after 6 s', () => {
    vi.useFakeTimers();
    announce(announced(4));

    act(() => vi.advanceTimersByTime(CYCLE_ANNOUNCEMENT_MS - 1));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('an announcement of another grid does not show on this one', () => {
    announce(announced(4, 'f0e1d2c3-b4a5-4968-8776-655443322110'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('the announcement changes nothing of the table stream version', () => {
    announce(announced(4));
    expect(characters.getState().version).toBe(3);
  });
});
