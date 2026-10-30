import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { createFolder, createGrid, gridItemOf, openLibrary } from './support/library';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinAsSpectatorAndEnter,
  joinByCodeAndEnter,
} from './support/tables';

const PORTRAIT = fileURLToPath(new URL('./fixtures/library-portrait.png', import.meta.url));
const LANDSCAPE = fileURLToPath(new URL('./fixtures/mapa-1400x700.png', import.meta.url));
type ImageRecord = Readonly<{
  id: string;
  folderId: string | null;
  asset: Readonly<{ id: string }>;
}>;

function campaignIdOf(page: Page): string {
  const id = /\/campaigns\/([0-9a-f-]{36})/.exec(new URL(page.url()).pathname)?.[1];
  if (!id) throw new Error(`expected campaign id in room URL; received ${page.url()}`);
  return id;
}

function viewerOf(page: Page, name: string): Locator {
  return page.getByRole('dialog', { name, exact: true });
}

async function createImage(
  page: Page,
  library: Locator,
  name: string,
  file: string = PORTRAIT,
  folder?: string,
): Promise<ImageRecord> {
  const destination = folder
    ? await gridItemOf(library, folder).getAttribute('data-tree-key')
    : null;
  if (folder) {
    await gridItemOf(library, folder).click({ button: 'right', position: { x: 50, y: 16 } });
    await page.getByRole('menuitem', { name: 'Nova imagem aqui', exact: true }).click();
  } else {
    await library.getByRole('button', { name: 'Criar item' }).click();
    await page.getByRole('menuitem', { name: 'Nova imagem', exact: true }).click();
  }
  const form = page.getByRole('dialog', { name: 'Nova imagem', exact: true });
  await form.getByLabel('Nome da imagem').fill(name);
  await form.getByLabel('Arquivo de imagem').setInputFiles(file);
  await expect(form.getByRole('img', { name: 'Imagem escolhida' })).toBeVisible();
  const saved = page.waitForResponse(
    (answer) => answer.request().method() === 'POST' && answer.url().endsWith('/library-images'),
  );
  await form.getByRole('button', { name: 'Salvar imagem', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const image: ImageRecord = await response.json();
  expect(image.folderId).toBe(destination);
  await expect(form).toBeHidden();
  await expect(gridItemOf(library, name)).toBeVisible();
  return image;
}

async function showImage(page: Page, name: string): Promise<void> {
  const library = await openLibrary(page);
  const search = library.getByRole('searchbox', { name: 'Buscar item' });
  await search.fill(name);
  await gridItemOf(library, name).click();
  await library.getByRole('button', { name: 'Mostrar para todos', exact: true }).click();
  await expect(viewerOf(page, name)).toBeVisible();
}

async function closeImage(page: Page, name: string): Promise<void> {
  await viewerOf(page, name).getByRole('button', { name: 'Fechar imagem', exact: true }).click();
  await expect(viewerOf(page, name)).toBeHidden();
}

async function assetStatus(page: Page, image: ImageRecord): Promise<number> {
  return (await page.request.get(`/api/assets/${image.asset.id}`)).status();
}

async function closeLibrary(page: Page): Promise<void> {
  const library = page.getByRole('dialog', { name: 'Biblioteca', exact: true });
  if (await library.isVisible())
    await library.getByRole('button', { name: 'Fechar biblioteca' }).click();
}

test('private image reaches player and spectator across grids; local close survives reload and a new presentation reopens it', async ({
  newPlayerPage,
}, testInfo) => {
  test.setTimeout(180_000);
  const master = await newPlayerPage();
  const player = await newPlayerPage({ reducedMotion: 'reduce' });
  const spectator = await newPlayerPage({ reducedMotion: 'reduce' });
  const table = `Retratos ${Date.now()}`;
  await signIn(master, adminCredentials());
  const code = await createTableAndReadCode(master, table);
  await signIn(player, BIA);
  await joinByCodeAndEnter(player, code, master);
  await signIn(spectator, CAIO);
  await joinAsSpectatorAndEnter(spectator, code);
  await enterFromTheList(master, table);
  const campaignId = campaignIdOf(master);
  const library = await openLibrary(master);
  await createFolder(library, 'Segredos');
  await createGrid(library, 'Preparação');
  await library.getByRole('button', { name: 'Abrir pra preparar' }).click();
  await expect(boardOf(master)).toHaveAccessibleName(/^Tabuleiro: Preparação/);
  const prepared = await openLibrary(master);
  await gridItemOf(prepared, 'Segredos').click({ position: { x: 50, y: 16 } });
  const image = await createImage(master, prepared, 'Retrato secreto', PORTRAIT, 'Segredos');
  await master.screenshot({ path: testInfo.outputPath('library-header.png') });
  for (const reader of [player, spectator]) {
    const readerLibrary = await openLibrary(reader);
    await expect(gridItemOf(readerLibrary, 'Retrato secreto')).toHaveCount(0);
    await expect(gridItemOf(readerLibrary, 'Segredos')).toHaveCount(0);
    expect(await assetStatus(reader, image)).toBe(404);
    await closeLibrary(reader);
  }
  await prepared.getByRole('button', { name: 'Mostrar para todos', exact: true }).click();
  for (const reader of [master, player, spectator]) {
    await expect(viewerOf(reader, 'Retrato secreto')).toBeVisible();
    await expect(
      viewerOf(reader, 'Retrato secreto').getByRole('img', { name: 'Retrato secreto' }),
    ).toBeVisible();
    expect(await assetStatus(reader, image)).toBe(200);
  }
  await expect(
    viewerOf(player, 'Retrato secreto').getByRole('img', { name: 'Retrato secreto' }),
  ).toHaveJSProperty('naturalWidth', 180);
  await player.screenshot({ path: testInfo.outputPath('portrait-transparent.png') });
  const late = await newPlayerPage({ reducedMotion: 'reduce' });
  await signIn(late, BIA);
  await enterFromTheList(late, table);
  await expect(boardOf(late)).toBeVisible();
  await expect(viewerOf(late, 'Retrato secreto')).toHaveCount(0);
  await closeImage(player, 'Retrato secreto');
  await expect(viewerOf(spectator, 'Retrato secreto')).toBeVisible();
  await player.reload();
  await expect(boardOf(player)).toBeVisible();
  await expect(viewerOf(player, 'Retrato secreto')).toHaveCount(0);
  const listing = await player.request.get(`/api/campaigns/${campaignId}/library`);
  expect((await listing.json()).images).toEqual([]);
  await closeImage(master, 'Retrato secreto');
  await closeLibrary(master);
  await showImage(master, 'Retrato secreto');
  await expect(viewerOf(late, 'Retrato secreto')).toBeVisible();
  await expect(viewerOf(player, 'Retrato secreto')).toBeVisible();
  await closeImage(master, 'Retrato secreto');
  await closeLibrary(master);
  const secondLibrary = await openLibrary(master);
  const replacement = await createImage(master, secondLibrary, 'Outro retrato', LANDSCAPE);
  const identity = await spectator.request.get('/api/auth/me');
  const spectatorId: string = (await identity.json()).user.id;
  const promoted = await master.request.patch(
    `/api/campaigns/${campaignId}/members/${spectatorId}`,
    { data: { role: 'master' } },
  );
  expect(promoted.status()).toBe(200);
  const replaced = await spectator.request.post(
    `/api/campaigns/${campaignId}/library-images/${replacement.id}/presentations`,
  );
  expect(replaced.status()).toBe(200);
  for (const reader of [master, player, spectator]) {
    await expect(viewerOf(reader, 'Outro retrato')).toBeVisible();
    await expect(viewerOf(reader, 'Retrato secreto')).toHaveCount(0);
  }
  expect(await assetStatus(player, image)).toBe(404);
  expect(await assetStatus(player, replacement)).toBe(200);
  await player.setViewportSize({ width: 390, height: 844 });
  await player.screenshot({ path: testInfo.outputPath('landscape-mobile.png') });
  const deleted = await master.request.delete(
    `/api/campaigns/${campaignId}/library-images/${replacement.id}`,
  );
  expect(deleted.status()).toBe(204);
  for (const reader of [master, player, spectator])
    await expect(viewerOf(reader, 'Outro retrato')).toBeHidden();
  expect(await assetStatus(player, replacement)).toBe(404);
});

test('public preview and mixed folders follow visibility; another campaign receives neither presentation nor file', async ({
  newPlayerPage,
}) => {
  test.setTimeout(150_000);
  const master = await newPlayerPage();
  const player = await newPlayerPage({ reducedMotion: 'reduce' });
  const outsider = await newPlayerPage({ reducedMotion: 'reduce' });
  const table = `Galeria ${Date.now()}`;
  await signIn(master, adminCredentials());
  const code = await createTableAndReadCode(master, table);
  await signIn(player, BIA);
  await joinByCodeAndEnter(player, code, master);
  await signIn(outsider, CAIO);
  const otherTable = `Outra galeria ${Date.now()}`;
  await createTableAndReadCode(outsider, otherTable);
  await enterFromTheList(outsider, otherTable);
  await enterFromTheList(master, table);
  const campaignId = campaignIdOf(master);
  const library = await openLibrary(master);
  await createFolder(library, 'Arquivo');
  await createGrid(library, 'Mapa antigo');
  const image = await createImage(master, library, 'Vista do castelo', PORTRAIT, 'Arquivo');
  const changed = await master.request.patch(
    `/api/campaigns/${campaignId}/library-images/${image.id}`,
    { data: { visibility: 'public' } },
  );
  expect(changed.status()).toBe(200);
  const playerLibrary = await openLibrary(player);
  await expect(gridItemOf(playerLibrary, 'Arquivo')).toBeVisible();
  await playerLibrary.getByRole('searchbox', { name: 'Buscar item' }).fill('Vista do castelo');
  await gridItemOf(playerLibrary, 'Vista do castelo').click();
  await playerLibrary.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(viewerOf(player, 'Vista do castelo')).toBeVisible();
  await expect(viewerOf(master, 'Vista do castelo')).toHaveCount(0);
  const bytes = await player.request.get(`/api/assets/${image.asset.id}`);
  expect(bytes.status()).toBe(200);
  expect(bytes.headers()['cache-control']).toBe('private, no-store');
  expect(await assetStatus(outsider, image)).toBe(404);
  expect(
    (await outsider.request.get(`/api/campaigns/${campaignId}/image-presentation`)).status(),
  ).toBe(404);
  const privated = await master.request.patch(
    `/api/campaigns/${campaignId}/library-images/${image.id}`,
    { data: { visibility: 'private' } },
  );
  expect(privated.status()).toBe(200);
  await expect(viewerOf(player, 'Vista do castelo')).toBeHidden();
  expect(await assetStatus(player, image)).toBe(404);
  await library.getByRole('button', { name: 'Mostrar para todos', exact: true }).click();
  await expect(viewerOf(player, 'Vista do castelo')).toBeVisible();
  await expect(viewerOf(outsider, 'Vista do castelo')).toHaveCount(0);
  expect(await assetStatus(outsider, image)).toBe(404);
  const hidden = await outsider.request.get(`/api/campaigns/${campaignId}/library`);
  expect(hidden.status()).toBe(404);
});
