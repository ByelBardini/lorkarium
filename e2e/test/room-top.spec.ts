import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf } from './support/board-cells';
import { closeLibrary, libraryOf, openLibrary, treeOf } from './support/library';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { boardOf, createTableAndReadCode, enterFromTheList } from './support/tables';
import { cardOf } from './support/token-cards';

function railTabOf(page: Page, name: string): Locator {
  return page
    .getByRole('tablist', { name: 'Painel da mesa' })
    .getByRole('tab', { name, exact: true });
}

function sidePanelOf(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Painel da mesa', exact: true });
}

async function createMasterToken(master: Page, name: string): Promise<void> {
  await master.getByRole('button', { name: 'Novo token' }).click();
  const dialog = master.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

test('the table menu opens by right click and copies the code; the library opens beside a clickable board and closes on a press outside; the rail collapses and reopens the panel', async ({
  newPlayerPage,
}) => {
  test.setTimeout(90_000);
  const name = `Mesa topo ${Date.now()}`;
  const admin = await newPlayerPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await enterFromTheList(admin, name);
  await expect(boardOf(admin)).toBeVisible();

  // The top holds no "N online", no loose "Sair da mesa" and no invite link anymore.
  const top = admin.getByRole('region', { name: 'Topo da sala' });
  await expect(top.getByText(/\d+ online/)).toHaveCount(0);
  await expect(top.getByRole('button', { name: 'Sair da mesa' })).toHaveCount(0);

  await admin.getByRole('button', { name: 'Menu da mesa', exact: true }).click({ button: 'right' });
  for (const entry of ['Configurações da mesa', 'Condições da mesa', 'Sair da mesa'])
    await expect(admin.getByRole('menuitem', { name: entry, exact: true })).toBeVisible();
  await expect(admin.getByRole('menuitem', { name: /convite/ })).toHaveCount(0);
  await admin.getByRole('menuitem', { name: 'Copiar código', exact: true }).click();
  await expect.poll(() => admin.evaluate<string>('navigator.clipboard.readText()')).toBe(code);

  // The room opens on "Na mesa". Clicking the open tab of the rail collapses the panel; clicking
  // it again brings it back.
  const people = railTabOf(admin, 'Na mesa');
  await expect(people).toHaveAttribute('aria-selected', 'true');
  await expect(people).toHaveAccessibleDescription('1 online');
  await expect(sidePanelOf(admin)).toBeVisible();
  await people.click();
  await expect(sidePanelOf(admin)).toHaveCount(0);
  await expect(people).toHaveAttribute('aria-selected', 'false');
  await people.click();
  await expect(sidePanelOf(admin)).toBeVisible();
  await expect(people).toHaveAttribute('aria-selected', 'true');
  // Another tab opens the panel on it, not a collapse.
  await railTabOf(admin, 'Dados').click();
  await expect(admin.getByRole('tabpanel', { name: 'Dados' })).toBeVisible();
  await railTabOf(admin, 'Dados').click();
  await expect(sidePanelOf(admin)).toHaveCount(0);

  // The Kael at the center cell (10, 6); its point is read before the drawer covers the zoom
  // buttons at the left, and the panel is back on "Combate", where the selected token shows.
  await createMasterToken(admin, 'Kael');
  const kael = await cellCenterOf(admin, 10, 6);
  await railTabOf(admin, 'Combate').click();
  await expect(sidePanelOf(admin)).toBeVisible();

  // The library opens beside the board, narrow, and leaves the board in reach: a press on the
  // board reaches the Kael and closes the drawer, as in an app's drawer.
  const library = await openLibrary(admin, { narrow: true });
  await expect(admin.getByRole('dialog', { name: 'Biblioteca' })).toHaveCount(0);
  await expect(
    admin.getByRole('region', { name: 'Abas da sala' }).getByRole('button', { name: 'Biblioteca' }),
  ).toHaveAttribute('aria-pressed', 'true');
  const drawer = await library.boundingBox();
  const panel = await sidePanelOf(admin).boundingBox();
  if (!drawer || !panel) throw new Error('the library drawer or the side panel has no box');
  expect(drawer.x + drawer.width).toBeLessThan(kael.x);
  expect(kael.x).toBeLessThan(panel.x);
  await admin.mouse.click(kael.x, kael.y);
  await expect(cardOf(admin, 'Kael')).toBeVisible();
  await expect(libraryOf(admin)).toHaveCount(0);

  // Without a close button of its own, Esc and the strip's "Biblioteca" close it too.
  await expect(treeOf(await openLibrary(admin, { narrow: true }))).toBeVisible();
  await admin.keyboard.press('Escape');
  await expect(libraryOf(admin)).toHaveCount(0);
  await openLibrary(admin, { narrow: true });
  await closeLibrary(admin);
});
