import { readFile, writeFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { gridItemOf, openLibrary } from './support/library';
import { test } from './support/player-pages';
import {
  campaignIdOf,
  createTemplateByApi,
  exportSheetTemplate,
  importSheetTemplate,
  type SheetSourceCode,
} from './support/sheets';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList } from './support/tables';

type TemplateCode = Readonly<{ id: string; name: string; html: string; css: string; js: string }>;

const EXPORTED: SheetSourceCode = {
  name: 'Modelo exportado',
  html: '<p id="marca">…</p>',
  css: '#marca { font-weight: bold; }',
  js: 'lorkarium.ready(); document.getElementById("marca").textContent = "Exportado da A";',
};

async function templateIdsOf(page: Page, campaignId: string): Promise<string[]> {
  const response = await page.request.get(`/api/campaigns/${campaignId}/library`);
  expect(response.status()).toBe(200);
  const library = (await response.json()) as { sheetTemplates?: { id: string }[] };
  return (library.sheetTemplates ?? []).map(({ id }) => id);
}

async function templateOf(page: Page, campaignId: string, id: string): Promise<TemplateCode> {
  const response = await page.request.get(`/api/campaigns/${campaignId}/sheet-templates/${id}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { template: TemplateCode }).template;
}

async function enterTable(admin: Page, name: string): Promise<string> {
  await admin.goto('/');
  await enterFromTheList(admin, name);
  return campaignIdOf(admin);
}

test('a template exported from Mesa A is imported into Mesa B with the same code, and a newer file is refused', async ({
  newPlayerPage,
}, testInfo) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const [tableA, tableB] = [`Mesa A modelo ${stamp}`, `Mesa B modelo ${stamp}`];
  const admin = await newPlayerPage();
  await signIn(admin, adminCredentials());
  await createTableAndReadCode(admin, tableA);
  await createTableAndReadCode(admin, tableB);

  const campaignA = await enterTable(admin, tableA);
  await createTemplateByApi(admin, campaignA, EXPORTED);
  const [originId] = await templateIdsOf(admin, campaignA);
  const download = await exportSheetTemplate(await openLibrary(admin), EXPORTED.name);
  expect(download.suggestedFilename()).toBe('Modelo exportado.lksheet');
  const filePath = testInfo.outputPath('Modelo exportado.lksheet');
  await download.saveAs(filePath);

  const campaignB = await enterTable(admin, tableB);
  const library = await openLibrary(admin);
  await importSheetTemplate(library, filePath);
  const confirm = admin.getByRole('dialog', { name: 'Importar modelo de ficha' });
  await expect(confirm.getByRole('textbox', { name: 'Nome do modelo' })).toHaveValue(EXPORTED.name);
  await confirm.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(confirm).toBeHidden();
  const editor = library.getByRole('region', { name: 'Editor do modelo' });
  await expect(editor.getByRole('textbox', { name: 'Nome do modelo' })).toHaveValue(EXPORTED.name);
  await expect(editor.frameLocator('iframe[title="Prévia da ficha"]').locator('#marca')).toHaveText(
    'Exportado da A',
  );

  const [importedId] = await templateIdsOf(admin, campaignB);
  expect(importedId).toBeDefined();
  expect(importedId).not.toBe(originId);
  const imported = await templateOf(admin, campaignB, importedId ?? '');
  expect({ ...imported, id: undefined }).toMatchObject({ ...EXPORTED, id: undefined });
  expect(await templateIdsOf(admin, campaignA)).toEqual([originId]);

  // A file of a newer format is refused before any create: Mesa B keeps one template.
  const newer = testInfo.outputPath('Modelo novo.lksheet');
  const original: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  await writeFile(newer, JSON.stringify({ ...(original as object), formatVersion: 2 }));
  await importSheetTemplate(library, newer);
  await expect(library.getByRole('alert')).toHaveText(
    'Este arquivo foi feito numa versão mais nova do Lorkarium.',
  );
  await expect(confirm).toHaveCount(0);
  expect(await templateIdsOf(admin, campaignB)).toEqual([importedId]);
  await expect(gridItemOf(library, EXPORTED.name)).toHaveCount(1);
});
