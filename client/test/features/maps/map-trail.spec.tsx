import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MapTrail } from '@/features/maps/map-trail';
import type { MapTrailStep } from '@/stores/map-view-store';
import { MUNDO_ID, REINO_ID } from '../../support/library-map-fixtures';

const MUNDO: MapTrailStep = { mapId: MUNDO_ID, name: 'Mundo', camera: null };
const REINO: MapTrailStep = { mapId: REINO_ID, name: 'Reino', camera: null };

function renderTrail(trail: readonly MapTrailStep[]) {
  const onBack = vi.fn();
  const onReturnTo = vi.fn();
  render(<MapTrail trail={trail} current="Vila" onBack={onBack} onReturnTo={onReturnTo} />);
  return { onBack, onReturnTo };
}

describe('MapTrail', () => {
  it('a map reached directly has no trail to show', () => {
    renderTrail([]);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows the path up to the map shown, marked as the current one', () => {
    renderTrail([MUNDO, REINO]);
    expect(screen.getByRole('list')).toHaveTextContent(/Mundo\s*›\s*Reino\s*›\s*Vila/);
    expect(screen.getByText('Vila')).toHaveAttribute('aria-current', 'page');
  });

  it('"Voltar" goes one step back', async () => {
    const { onBack } = renderTrail([MUNDO, REINO]);
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('a step of the trail takes back to it', async () => {
    const { onReturnTo } = renderTrail([MUNDO, REINO]);
    await userEvent.click(screen.getByRole('button', { name: 'Mundo' }));
    expect(onReturnTo).toHaveBeenCalledExactlyOnceWith(0);
  });
});
