import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapRegionLinkDto, MapRegionLinkTargetDto } from '@lorkarium/contracts';
import { describe, expect, it, vi } from 'vitest';
import { MapLinkPicker } from '@/features/maps/map-link-picker';
import { DOCUMENT_ID, documentFixture } from '../../support/documents-fixtures';
import { PORTRAIT, vharnLibrary } from '../../support/library-fixtures';
import { MUNDO_ID, REINO_ID, libraryMapSummary } from '../../support/library-map-fixtures';
import { ESTRADA_SCENE } from '../../support/scene-tab-fixtures';
import { lyraSummary } from '../../support/sheet-fixtures';
import { tormentaSummary } from '../../support/sheet-template-fixtures';

const LIBRARY = vharnLibrary({
  documents: [documentFixture({ name: 'Crônica do Ossuário' })],
  images: [PORTRAIT],
  maps: [libraryMapSummary(), libraryMapSummary({ id: REINO_ID, name: 'Reino' })],
  sheets: [lyraSummary({ name: 'Ficha de Lyra' })],
  sheetTemplates: [tormentaSummary({ name: 'Modelo Tormenta' })],
});

const OPEN_LINK: MapRegionLinkDto = {
  state: 'open',
  kind: 'document',
  id: DOCUMENT_ID,
  name: 'Crônica do Ossuário',
};

function renderPicker(link: MapRegionLinkDto = null, disabled = false) {
  const onChange = vi.fn<(target: MapRegionLinkTargetDto | null) => void>();
  render(
    <MapLinkPicker
      mapId={MUNDO_ID}
      link={link}
      library={LIBRARY}
      disabled={disabled}
      onChange={onChange}
    />,
  );
  return { onChange };
}

function optionNames(): string[] {
  const list = screen.getByRole('list', { name: 'Itens da biblioteca' });
  return within(list)
    .getAllByRole('button')
    .map((option) => option.getAttribute('aria-label') ?? '');
}

describe('MapLinkPicker', () => {
  it('lists documents, grids, other maps and images of the library in name order', () => {
    renderPicker();
    expect(optionNames()).toEqual([
      'Grid: Cena 1',
      'Documento: Crônica do Ossuário',
      'Grid: Estrada de Vharn',
      'Mapa: Reino',
      'Imagem: Retrato',
      'Grid: Torre',
    ]);
  });

  it('never offers the map being edited, a sheet or a sheet template', () => {
    renderPicker();
    const offered = optionNames().join('\n');
    expect(offered).not.toContain('Mundo');
    expect(offered).not.toContain('Ficha de Lyra');
    expect(offered).not.toContain('Modelo Tormenta');
  });

  it('finds an item by search without caring for accents or case', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByLabelText('Buscar item'), 'CRONICA');
    expect(optionNames()).toEqual(['Documento: Crônica do Ossuário']);
  });

  describe('type filters', () => {
    function filter(name: string): HTMLElement {
      return within(screen.getByRole('group', { name: 'Filtrar por tipo' })).getByRole('button', {
        name,
      });
    }

    it('starts on "Todos"', () => {
      renderPicker();
      expect(filter('Todos')).toHaveAttribute('aria-pressed', 'true');
      expect(filter('Grids')).toHaveAttribute('aria-pressed', 'false');
    });

    it('a filter leaves only items of that kind', async () => {
      const user = userEvent.setup();
      renderPicker();
      await user.click(filter('Grids'));
      expect(optionNames()).toEqual(['Grid: Cena 1', 'Grid: Estrada de Vharn', 'Grid: Torre']);
      expect(filter('Grids')).toHaveAttribute('aria-pressed', 'true');
    });

    it('"Todos" brings every kind back', async () => {
      const user = userEvent.setup();
      renderPicker();
      await user.click(filter('Mapas'));
      await user.click(filter('Todos'));
      expect(optionNames()).toHaveLength(6);
    });

    it('filter and search work together', async () => {
      const user = userEvent.setup();
      renderPicker();
      await user.click(filter('Grids'));
      await user.type(screen.getByLabelText('Buscar item'), 'torre');
      expect(optionNames()).toEqual(['Grid: Torre']);
    });

    it('does not offer a filter for a kind with nothing to pick', () => {
      render(
        <MapLinkPicker
          mapId={MUNDO_ID}
          link={null}
          library={{ ...LIBRARY, maps: [libraryMapSummary()], images: [] }}
          onChange={vi.fn()}
        />,
      );
      const filters = within(screen.getByRole('group', { name: 'Filtrar por tipo' }));
      expect(filters.queryByRole('button', { name: 'Mapas' })).not.toBeInTheDocument();
      expect(filters.queryByRole('button', { name: 'Imagens' })).not.toBeInTheDocument();
      expect(filters.getByRole('button', { name: 'Documentos' })).toBeInTheDocument();
    });

    it('turns off with the rest of the picker', () => {
      renderPicker(null, true);
      expect(filter('Grids')).toBeDisabled();
    });
  });

  describe('where each item is', () => {
    function rowOf(name: string): HTMLElement {
      return screen.getByRole('button', { name });
    }

    it('says the kind of an item out of any folder', () => {
      renderPicker();
      expect(rowOf('Grid: Cena 1')).toHaveTextContent(/^Cena 1Grid$/);
    });

    it('says the folder of an item', () => {
      renderPicker();
      expect(rowOf('Grid: Estrada de Vharn')).toHaveTextContent('Grid · Ato 1');
    });

    it('says the whole way down a nested folder', () => {
      renderPicker();
      expect(rowOf('Grid: Torre')).toHaveTextContent('Grid · Ato 1 › Catacumbas');
    });
  });

  it('says so when the search finds nothing', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByLabelText('Buscar item'), 'dragão');
    expect(screen.getByText('Nenhum item com esse nome.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Itens da biblioteca' })).not.toBeInTheDocument();
  });

  it.each<[string, MapRegionLinkTargetDto]>([
    ['Documento: Crônica do Ossuário', { kind: 'document', id: DOCUMENT_ID }],
    ['Grid: Estrada de Vharn', { kind: 'scene', id: ESTRADA_SCENE.id }],
    ['Mapa: Reino', { kind: 'map', id: REINO_ID }],
    ['Imagem: Retrato', { kind: 'image', id: PORTRAIT.id }],
  ])('picking "%s" sends its kind and id', async (name, target) => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await user.click(screen.getByRole('button', { name }));
    expect(onChange.mock.calls).toEqual([[target]]);
  });

  it('says there is no link and offers nothing to remove on a region without one', () => {
    renderPicker();
    expect(screen.getByText('Sem link')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover link' })).not.toBeInTheDocument();
  });

  it('shows an open link by kind and name, with the list out of the way', () => {
    renderPicker(OPEN_LINK);
    expect(screen.getByText('Documento: Crônica do Ossuário')).toBeInTheDocument();
    expect(screen.queryByLabelText('Buscar item')).not.toBeInTheDocument();
  });

  it('"Remover link" sends no target', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker(OPEN_LINK);
    await user.click(screen.getByRole('button', { name: 'Remover link' }));
    expect(onChange.mock.calls).toEqual([[null]]);
  });

  it('"Trocar item" opens the list and picking closes it again', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker(OPEN_LINK);
    await user.click(screen.getByRole('button', { name: 'Trocar item' }));
    await user.click(screen.getByRole('button', { name: 'Mapa: Reino' }));
    expect(onChange.mock.calls).toEqual([[{ kind: 'map', id: REINO_ID }]]);
    expect(screen.queryByLabelText('Buscar item')).not.toBeInTheDocument();
  });

  it('a removed link says so, keeps the list and can be replaced by another item', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ state: 'removed', kind: 'image' });
    expect(screen.getByText('Link removido')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Grid: Estrada de Vharn' }));
    expect(onChange.mock.calls).toEqual([[{ kind: 'scene', id: ESTRADA_SCENE.id }]]);
  });

  it('a removed link can also be cleared for good', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ state: 'removed', kind: 'image' });
    await user.click(screen.getByRole('button', { name: 'Remover link' }));
    expect(onChange.mock.calls).toEqual([[null]]);
  });

  it('a locked link names nothing and can still be replaced', async () => {
    const user = userEvent.setup();
    renderPicker({ state: 'locked' });
    expect(screen.getByText('Item que você não pode ver')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trocar item' }));
    expect(screen.getByLabelText('Buscar item')).toBeInTheDocument();
  });

  it('turns everything off while the editor is blocked', () => {
    renderPicker(null, true);
    expect(screen.getByLabelText('Buscar item')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mapa: Reino' })).toBeDisabled();
  });
});
