import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapRegionDto } from '@lorkarium/contracts';
import { describe, expect, it, vi } from 'vitest';
import { MapRegionCard } from '@/features/maps/map-region-card';
import { REINO_ID, mapRegion } from '../../support/library-map-fixtures';

const OPEN_MAP = { state: 'open', kind: 'map', id: REINO_ID, name: 'Reino' } as const;

function renderCard(region: MapRegionDto = mapRegion(), actions?: React.ReactNode) {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  render(<MapRegionCard region={region} onOpen={onOpen} onClose={onClose} actions={actions} />);
  return { onOpen, onClose };
}

describe('MapRegionCard', () => {
  it('shows the name and the description of the region', () => {
    renderCard();
    const card = screen.getByRole('region', { name: 'Capital' });
    expect(card).toHaveTextContent('Capital');
    expect(card).toHaveTextContent('Onde o rei mora.');
  });

  it('an open link says what it leads to and offers "Abrir"', async () => {
    const { onOpen } = renderCard(mapRegion({ link: OPEN_MAP }));
    expect(screen.getByText('Mapa: Reino')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('a locked link says only that it was not revealed', () => {
    renderCard(mapRegion({ link: { state: 'locked' } }));
    expect(screen.getByText('O mestre ainda não revelou isto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument();
  });

  it('a removed link tells the master, with nothing to open', () => {
    renderCard(mapRegion({ link: { state: 'removed', kind: 'document' } }));
    expect(screen.getByText('Link removido')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument();
  });

  it('a region with no link is only the card', () => {
    renderCard(mapRegion({ link: null }));
    expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument();
    expect(screen.queryByText('O mestre ainda não revelou isto')).not.toBeInTheDocument();
  });

  it('a hidden region tells the master that only masters see it', () => {
    renderCard(mapRegion({ hidden: true }));
    expect(screen.getByText('Oculta para jogadores')).toBeInTheDocument();
  });

  it('closes by its button', async () => {
    const { onClose } = renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar cartão' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has room for other actions beside "Abrir"', () => {
    renderCard(mapRegion({ link: OPEN_MAP }), <button type="button">Mostrar a todos</button>);
    expect(screen.getByRole('button', { name: 'Mostrar a todos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
  });
});
