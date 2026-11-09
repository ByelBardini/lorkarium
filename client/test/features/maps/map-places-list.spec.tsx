import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapRegionDto } from '@lorkarium/contracts';
import { describe, expect, it, vi } from 'vitest';
import { MapPlacesList } from '@/features/maps/map-places-list';
import { forestRegion, mapRegion, pinRegion } from '../../support/library-map-fixtures';

const REGIONS: readonly MapRegionDto[] = [
  pinRegion({ name: 'Ossuário' }),
  mapRegion({ name: 'Ásgard' }),
  forestRegion({
    name: 'Bosque',
    geometry: {
      shape: 'polygon',
      points: [
        { x: 0.9, y: 0.9 },
        { x: 1, y: 0.9 },
        { x: 1, y: 1 },
      ],
    },
  }),
];

const REINO = forestRegion({
  id: 'reino',
  name: 'Reino',
  geometry: {
    shape: 'polygon',
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ],
  },
});
const TAVERNA = pinRegion({ id: 'taverna', name: 'Taverna' });
const CAPITAL = mapRegion({
  id: 'capital',
  name: 'Capital',
  geometry: {
    shape: 'polygon',
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.3, y: 0.2 },
      { x: 0.3, y: 0.3 },
    ],
  },
});

function renderList(regions: readonly MapRegionDto[] = REGIONS) {
  const onChoose = vi.fn();
  render(<MapPlacesList regions={regions} onChoose={onChoose} />);
  return { onChoose };
}

async function opened(regions?: readonly MapRegionDto[]) {
  const rendered = renderList(regions);
  await userEvent.click(screen.getByRole('button', { name: 'Lugares neste mapa' }));
  return rendered;
}

function places(): (string | null)[] {
  return within(screen.getByRole('list'))
    .getAllByRole('button')
    .map((place) => place.textContent);
}

describe('MapPlacesList', () => {
  it('starts closed, so it does not cover the map', () => {
    renderList();
    expect(screen.getByRole('button', { name: 'Lugares neste mapa' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('a map with no region offers no list', () => {
    renderList([]);
    expect(screen.queryByRole('button', { name: 'Lugares neste mapa' })).not.toBeInTheDocument();
  });

  it('lists the places by name, in reading order', async () => {
    await opened();
    expect(places()).toEqual(['Ásgard', 'Bosque', 'Ossuário']);
  });

  it('searches without accents or case', async () => {
    await opened();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar lugar' }), 'OSSUA');
    expect(places()).toEqual(['Ossuário']);
  });

  it('a search that finds nothing says so', async () => {
    await opened();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar lugar' }), 'xyz');
    expect(screen.getByText('Nenhum lugar com esse nome.')).toBeInTheDocument();
  });

  it('choosing a place hands it over', async () => {
    const { onChoose } = await opened();
    await userEvent.click(screen.getByRole('button', { name: 'Bosque' }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(REGIONS[2]);
  });

  describe('the icon beside a place', () => {
    it('a pin shows the icon it has, without changing its name', async () => {
      await opened([pinRegion({ name: 'Forte', icon: 'castle' })]);
      const place = screen.getByRole('button', { name: 'Forte' });
      expect(place.querySelector('[data-pin-icon="castle"]')).toBeInTheDocument();
    });

    it('a polygon shows no icon', async () => {
      await opened([mapRegion({ name: 'Reino', icon: 'castle' })]);
      const place = screen.getByRole('button', { name: 'Reino' });
      expect(place.querySelector('[data-pin-icon]')).not.toBeInTheDocument();
    });
  });

  describe('places inside other places', () => {
    const NESTED = [TAVERNA, CAPITAL, REINO];

    it('shows only the outer place until it is expanded', async () => {
      await opened(NESTED);
      expect(screen.getByRole('button', { name: 'Reino' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Taverna' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Expandir Reino' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('expanding shows what is inside, and collapsing hides it again', async () => {
      await opened(NESTED);
      await userEvent.click(screen.getByRole('button', { name: 'Expandir Reino' }));
      expect(screen.getByRole('button', { name: 'Capital' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Taverna' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Recolher Reino' }));
      expect(screen.queryByRole('button', { name: 'Taverna' })).not.toBeInTheDocument();
    });

    it('a place with nothing inside has nothing to expand', async () => {
      await opened(NESTED);
      await userEvent.click(screen.getByRole('button', { name: 'Expandir Reino' }));
      expect(screen.queryByRole('button', { name: 'Expandir Taverna' })).not.toBeInTheDocument();
    });

    it('expanding does not choose the place', async () => {
      const { onChoose } = await opened(NESTED);
      await userEvent.click(screen.getByRole('button', { name: 'Expandir Reino' }));
      expect(onChoose).not.toHaveBeenCalled();
    });

    it('a search opens the way to a place found inside another', async () => {
      await opened(NESTED);
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar lugar' }), 'taverna');
      expect(screen.getByRole('button', { name: 'Taverna' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reino' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Capital' })).not.toBeInTheDocument();
    });

    it('choosing an inner place hands it over', async () => {
      const { onChoose } = await opened(NESTED);
      await userEvent.click(screen.getByRole('button', { name: 'Expandir Reino' }));
      await userEvent.click(screen.getByRole('button', { name: 'Taverna' }));
      expect(onChoose).toHaveBeenCalledExactlyOnceWith(TAVERNA);
    });
  });
});
