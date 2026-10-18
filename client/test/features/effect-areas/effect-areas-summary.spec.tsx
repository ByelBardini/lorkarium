import type { EffectAreaDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EffectAreasSummary } from '@/features/effect-areas/effect-areas-summary';
import { createBoardStore } from '@/stores/board-store';
import { createTablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { anaCircle, biaCone } from '../../support/effect-area-fixtures';
import { vharnBoard, vharnState } from '../../support/table-session-fixtures';

function renderSummary(effectAreas: EffectAreaDto[]): void {
  const board = createBoardStore(VHARN.id, () => undefined);
  board.getState().apply({ kind: 'board', state: vharnBoard({ effectAreas }) });
  const presence = createTablePresenceStore(VHARN.id);
  presence.getState().apply({ kind: 'state', state: vharnState() });
  render(<EffectAreasSummary board={board} presence={presence} />);
}

function itemsOfSummary(): string[] {
  const list = screen.getByRole('list', { name: 'Áreas na cena' });
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

describe('EffectAreasSummary', () => {
  it('reads each area by shape, color, size, author and the cell it leaves from', () => {
    renderSummary([biaCone(), anaCircle()]);

    expect(itemsOfSummary()).toEqual([
      'Cone diagonal, Brasa, 3 casas · 4,5 m, de Bia, coluna 6, linha 6',
      'Círculo, Musgo, 2 casas · 3 m, de Ana, coluna 11, linha 6',
    ]);
  });

  it('an area whose author is gone reads "sem autor"', () => {
    renderSummary([biaCone({ authorId: null })]);

    expect(itemsOfSummary()[0]).toContain('sem autor');
  });

  it('a scene with no area has an empty list', () => {
    renderSummary([]);

    expect(itemsOfSummary()).toEqual([]);
  });
});
