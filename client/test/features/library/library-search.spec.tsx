import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { PORTRAIT, masterLibrary, playerLibrary } from '../../support/library-fixtures';
import { openLibrary, openRoom } from '../../support/library-harness';
import {
  filterLibraryVisibility,
  openLibraryFilters,
  pickLibraryType,
  treeItemNames,
} from '../../support/library-tree';

describe('the search and its filters', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.libraryApi.answer('list', { ok: true, value: masterLibrary({ images: [PORTRAIT] }) });
  });

  function pill(label: string): HTMLElement | null {
    return screen.queryByRole('button', { name: `Tirar o filtro ${label}` });
  }

  async function typeOptions(): Promise<HTMLElement> {
    const filters = await openLibraryFilters();
    return within(filters).getByRole('radiogroup', { name: 'Tipo de item' });
  }

  it('the popover lists every type for the master, each with its count, "Tudo" chosen', async () => {
    await openLibrary(deps);
    const types = await typeOptions();
    const options = within(types).getAllByRole('radio');
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
      'Tudo',
      'Grids',
      'Imagens',
      'Mapas',
      'Documentos',
      'Modelos de ficha',
      'Fichas',
    ]);
    expect(options.map((option) => option.textContent)).toEqual([
      'Tudo5',
      'Grids4',
      'Imagens1',
      'Mapas0',
      'Documentos0',
      'Modelos de ficha0',
      'Fichas0',
    ]);
    expect(within(types).getByRole('radio', { name: 'Tudo' })).toBeChecked();
  });

  it('a type picked filters the tree and shows as a pill; its × gives every type back', async () => {
    await openLibrary(deps);
    expect(pill('Imagens')).toBeNull();
    await pickLibraryType('Imagens');
    expect(treeItemNames()).toEqual(['Retrato']);
    await userEvent.click(pill('Imagens') ?? document.body);
    expect(pill('Imagens')).toBeNull();
    expect(treeItemNames()).toContain('Cena 1');
    expect(within(await typeOptions()).getByRole('radio', { name: 'Tudo' })).toBeChecked();
  });

  it('a visibility picked shows as its own pill beside the type, each removed alone', async () => {
    await openLibrary(deps);
    await pickLibraryType('Grids');
    await filterLibraryVisibility('Privados');
    expect(treeItemNames()).toEqual(['Ato 1', 'Catacumbas', 'Torre', 'Ossuário']);
    await userEvent.click(pill('Privados') ?? document.body);
    expect(pill('Privados')).toBeNull();
    expect(pill('Grids')).toBeInTheDocument();
    expect(treeItemNames()).toContain('Cena 1');
  });

  it('the filter button turns gold while any filter is on', async () => {
    await openLibrary(deps);
    const button = screen.getByRole('button', { name: 'Filtrar itens' });
    expect(button).not.toHaveClass('text-primary');
    await filterLibraryVisibility('Públicos');
    expect(button).toHaveClass('text-primary');
  });

  it('a player filters by type, without "Modelos de ficha" nor the visibility', async () => {
    deps.libraryApi.answer('list', { ok: true, value: playerLibrary() });
    await openLibrary(deps, { role: 'player' });
    const filters = await openLibraryFilters();
    expect(within(filters).queryByRole('radiogroup', { name: 'Visibilidade' })).toBeNull();
    const types = within(filters).getByRole('radiogroup', { name: 'Tipo de item' });
    expect(within(types).queryByRole('radio', { name: 'Modelos de ficha' })).toBeNull();
  });

  it('"?type=grid" in the address opens the library with Grids chosen, as a pill', async () => {
    const { router } = await openRoom(deps);
    await act(() => router.navigate(`/campaigns/${VHARN.id}/table/library?type=grid`));
    await screen.findByRole('tree', { name: 'Itens e pastas' });
    expect(pill('Grids')).toBeInTheDocument();
    expect(treeItemNames()).not.toContain('Retrato');
    expect(within(await typeOptions()).getByRole('radio', { name: 'Grids' })).toBeChecked();
  });
});
