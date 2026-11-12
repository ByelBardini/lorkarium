import { PLAN_LIMITS, type CampaignLibraryDto } from '@lorkarium/contracts';
import { within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { libraryScene, masterLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { libraryMapSummary } from '../../support/library-map-fixtures';
import { openTreeMenu, startHeaderNewItem, treeItem } from '../../support/library-tree';
import { tormentaSummary } from '../../support/sheet-template-fixtures';

const FIFTH_GRID = libraryScene({
  id: '5e5e5e5e-1a1a-4b2b-8c3c-d4d4d4d4d4d4',
  name: 'Cripta',
  widthCells: 10,
  heightCells: 10,
});

const AT_FREE_CEILING: CampaignLibraryDto = masterLibrary({
  scenes: [...masterLibrary().scenes, FIFTH_GRID],
  maps: [libraryMapSummary()],
  sheetTemplates: [tormentaSummary()],
});

function card(dialog: HTMLElement, kind: string): HTMLElement {
  return within(within(dialog).getByRole('group', { name: 'Tipo do item' })).getByRole('button', {
    name: kind,
  });
}

describe('the library under the table plan', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  it('a free table with 5 grids, 1 map and 1 template turns those cards off, with the hint', async () => {
    deps.libraryApi.answer('list', { ok: true, value: AT_FREE_CEILING });
    await openLibrary(deps, { limits: PLAN_LIMITS.free });
    const dialog = await startHeaderNewItem('Pasta');
    expect(card(dialog, 'Grid')).toBeDisabled();
    expect(card(dialog, 'Grid')).toHaveAccessibleDescription(
      'Esta mesa usa o plano Grátis, que permite até 5 grids. O Narrador libera 20.',
    );
    expect(card(dialog, 'Mapa')).toHaveAccessibleDescription(/permite até 1 mapa interativo\./);
    expect(card(dialog, 'Modelo de ficha')).toHaveAccessibleDescription(
      /permite até 1 modelo de ficha\./,
    );
    expect(card(dialog, 'Mapa')).toBeDisabled();
    expect(card(dialog, 'Modelo de ficha')).toBeDisabled();
    expect(card(dialog, 'Documento')).toBeEnabled();
  });

  it('a free table below its ceilings keeps every card', async () => {
    await openLibrary(deps, { limits: PLAN_LIMITS.free });
    const dialog = await startHeaderNewItem('Pasta');
    for (const kind of ['Grid', 'Mapa', 'Modelo de ficha'])
      expect(card(dialog, kind)).toBeEnabled();
  });

  it('a free table has no "Duplicar": off in the menu, with "Disponível no Narrador"', async () => {
    await openLibrary(deps, { limits: PLAN_LIMITS.free });
    const menu = await openTreeMenu(treeItem('Cena 1'));
    const duplicate = within(menu).getByRole('menuitem', { name: 'Duplicar' });
    expect(duplicate).toHaveAttribute('aria-disabled', 'true');
    expect(duplicate).toHaveAccessibleDescription('Disponível no Narrador');
  });

  it('a Narrador table at 20 grids cannot duplicate either: no room for the copy', async () => {
    const scenes = Array.from({ length: 20 }, (_, index) =>
      libraryScene({
        id: `5e5e5e5e-1a1a-4b2b-8c3c-${String(index).padStart(12, '0')}`,
        name: `Grid ${index}`,
        widthCells: 10,
        heightCells: 10,
      }),
    );
    deps.libraryApi.answer('list', {
      ok: true,
      value: masterLibrary({ scenes, activeSceneId: scenes[0]?.id ?? null }),
    });
    await openLibrary(deps, { limits: PLAN_LIMITS.narrador });
    const menu = await openTreeMenu(treeItem('Grid 3'));
    expect(within(menu).getByRole('menuitem', { name: 'Duplicar' })).toHaveAccessibleDescription(
      /permite até 20 grids\. A Lenda libera 500\./,
    );
  });

  it('Amigo do Dono duplicates as before', async () => {
    deps.libraryApi.answer('list', { ok: true, value: AT_FREE_CEILING });
    await openLibrary(deps);
    const menu = await openTreeMenu(treeItem('Cena 1'));
    expect(within(menu).getByRole('menuitem', { name: 'Duplicar' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('Amigo do Dono creates past the free ceilings', async () => {
    deps.libraryApi.answer('list', { ok: true, value: AT_FREE_CEILING });
    await openLibrary(deps);
    const dialog = await startHeaderNewItem('Pasta');
    for (const kind of ['Grid', 'Mapa', 'Modelo de ficha'])
      expect(card(dialog, kind)).toBeEnabled();
  });
});
