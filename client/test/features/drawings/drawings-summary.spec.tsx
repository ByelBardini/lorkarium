import type { DrawingDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawingsSummary } from '@/features/drawings/drawings-summary';
import { createBoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { path, square } from '../../support/drawing-fixtures';
import { vharnBoard } from '../../support/table-session-fixtures';

function renderSummary(drawings: DrawingDto[]): void {
  const board = createBoardStore(VHARN.id, () => undefined);
  board.getState().apply({ kind: 'board', state: vharnBoard({ drawings }) });
  render(<DrawingsSummary board={board} />);
}

describe('DrawingsSummary', () => {
  it('lists each drawing of the scene by its shape and the cell of its corner, counted from 1', () => {
    renderSummary([square(), path({ layer: 'background' })]);

    const items = within(screen.getByRole('list', { name: 'Desenhos na cena' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual([
      'Quadrado, coluna 3, linha 4',
      'Mão livre, coluna 2, linha 2, no Fundo',
    ]);
  });

  it('a scene with no drawing has an empty list', () => {
    renderSummary([]);

    expect(
      within(screen.getByRole('list', { name: 'Desenhos na cena' })).queryAllByRole('listitem'),
    ).toEqual([]);
  });
});
