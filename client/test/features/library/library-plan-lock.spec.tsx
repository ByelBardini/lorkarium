import { PLAN_LIMITS, type CampaignLibraryDto } from '@lorkarium/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { OSSUARIO, masterLibrary } from '../../support/library-fixtures';
import { openLibrary } from '../../support/library-harness';
import { libraryMapSummary } from '../../support/library-map-fixtures';
import { openTreeMenu, treeItem } from '../../support/library-tree';
import { tormentaSummary } from '../../support/sheet-template-fixtures';

const GRID_LOCKED =
  'Este grid passou do limite do plano Grátis (3) e está só leitura. Apague um grid mais antigo ou suba de plano.';
const MAP_LOCKED =
  'Este mapa interativo passou do limite do plano Grátis (0) e está só leitura: mostrar, Principal e apagar seguem livres. Apague um mapa mais antigo ou suba de plano.';

// A free table that came down: Cena 1 (out of any folder, not the group's), the map and the
// template are past their ceilings.
function lockedLibrary(locked: boolean): CampaignLibraryDto {
  const [cena, ...rest] = masterLibrary().scenes;
  if (!cena) throw new Error('masterLibrary() lost Cena 1');
  return masterLibrary({
    activeSceneId: OSSUARIO.id,
    scenes: [{ ...cena, planLocked: locked }, ...rest],
    maps: [libraryMapSummary({ planLocked: locked })],
    sheetTemplates: [tormentaSummary({ planLocked: locked })],
  });
}

function lockOf(item: HTMLElement): HTMLElement | null {
  return within(item).queryByRole('img', { name: 'Só leitura' });
}

function gridPanel(): HTMLElement {
  return screen.getByRole('region', { name: 'Grid escolhido' });
}

describe('items past the plan ceiling in the library', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  it('a planLocked grid, map and template carry the lock named "Só leitura"', async () => {
    deps.libraryApi.answer('list', { ok: true, value: lockedLibrary(true) });
    await openLibrary(deps, { limits: PLAN_LIMITS.free });
    for (const name of ['Cena 1', 'Mundo', 'Ficha Tormenta'])
      expect(lockOf(treeItem(name))).not.toBeNull();
    expect(lockOf(treeItem('Cena 1'))?.parentElement).toHaveAttribute('title', GRID_LOCKED);
  });

  it('the menu of a locked grid turns Renomear and Duplicar off with the sentence; Excluir stays', async () => {
    deps.libraryApi.answer('list', { ok: true, value: lockedLibrary(true) });
    await openLibrary(deps, { limits: PLAN_LIMITS.narrador });
    const menu = await openTreeMenu(treeItem('Cena 1'));
    for (const name of ['Renomear', 'Duplicar']) {
      const item = within(menu).getByRole('menuitem', { name });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAccessibleDescription(
        'Este grid passou do limite do plano Narrador (15) e está só leitura. Apague um grid mais antigo ou suba de plano.',
      );
    }
    expect(within(menu).getByRole('menuitem', { name: 'Excluir grid' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('the panel of a locked grid keeps the name and Duplicar off; who sees it, open and Excluir stay', async () => {
    deps.libraryApi.answer('list', { ok: true, value: lockedLibrary(true) });
    await openLibrary(deps, { limits: PLAN_LIMITS.free });
    await userEvent.click(treeItem('Cena 1'));
    const panel = gridPanel();
    expect(within(panel).getByRole('img', { name: 'Só leitura' })).toBeVisible();
    expect(within(panel).getByRole('textbox', { name: 'Nome' })).toBeDisabled();
    expect(within(panel).getByRole('textbox', { name: 'Nome' })).toHaveAccessibleDescription(
      GRID_LOCKED,
    );
    expect(within(panel).getByRole('button', { name: 'Duplicar' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Excluir' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: 'Abrir pra preparar' })).toBeEnabled();
    expect(within(panel).getByRole('radio', { name: 'Público' })).toBeEnabled();
  });

  it('a locked grid, map or template does not drag to another folder', async () => {
    deps.libraryApi.answer('list', { ok: true, value: lockedLibrary(true) });
    await openLibrary(deps, { limits: PLAN_LIMITS.free });
    for (const name of ['Cena 1', 'Mundo', 'Ficha Tormenta'])
      expect(treeItem(name)).not.toHaveAttribute('draggable');
  });

  it('the menu of a locked map turns Renomear off; Principal and Excluir mapa stay', async () => {
    deps.libraryApi.answer('list', { ok: true, value: lockedLibrary(true) });
    await openLibrary(deps, { limits: PLAN_LIMITS.free });
    const menu = await openTreeMenu(treeItem('Mundo'));
    const rename = within(menu).getByRole('menuitem', { name: 'Renomear' });
    expect(rename).toHaveAttribute('aria-disabled', 'true');
    expect(rename).toHaveAccessibleDescription(MAP_LOCKED);
    for (const name of ['Marcar como principal', 'Excluir mapa', 'Abrir'])
      expect(within(menu).getByRole('menuitem', { name })).not.toHaveAttribute('aria-disabled');
  });

  it('the panel of a locked map keeps the name and who sees it off; Principal and Excluir stay', async () => {
    deps.libraryApi.answer('list', { ok: true, value: lockedLibrary(true) });
    await openLibrary(deps, { limits: PLAN_LIMITS.free });
    await userEvent.click(treeItem('Mundo'));
    const panel = screen.getByRole('region', { name: 'Mapa escolhido' });
    expect(within(panel).getByRole('img', { name: 'Só leitura' })).toBeVisible();
    expect(within(panel).getByRole('textbox', { name: 'Nome do mapa' })).toBeDisabled();
    expect(
      within(panel).getByRole('textbox', { name: 'Nome do mapa' }),
    ).toHaveAccessibleDescription(MAP_LOCKED);
    expect(within(panel).getByRole('radio', { name: 'Privado' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Marcar como principal' })).toBeEnabled();
    expect(within(panel).getByRole('button', { name: 'Excluir mapa' })).toBeEnabled();
  });

  it('without planLocked nothing changes: no lock, Renomear on, the name editable, dragging on', async () => {
    deps.libraryApi.answer('list', { ok: true, value: lockedLibrary(false) });
    await openLibrary(deps, { limits: PLAN_LIMITS.free });
    for (const name of ['Cena 1', 'Mundo', 'Ficha Tormenta']) {
      expect(lockOf(treeItem(name))).toBeNull();
      expect(treeItem(name)).toHaveAttribute('draggable', 'true');
    }
    const menu = await openTreeMenu(treeItem('Cena 1'));
    expect(within(menu).getByRole('menuitem', { name: 'Renomear' })).not.toHaveAttribute(
      'aria-disabled',
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(treeItem('Cena 1'));
    expect(within(gridPanel()).getByRole('textbox', { name: 'Nome' })).toBeEnabled();
  });
});
