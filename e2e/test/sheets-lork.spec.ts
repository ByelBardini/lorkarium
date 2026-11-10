import { fileURLToPath } from 'node:url';
import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { openLibrary } from './support/library';
import { test } from './support/player-pages';
import {
  importSheetTemplate,
  newSheetOnToken,
  openSheetFromCard,
  openSheetTable,
  patchSheetValues,
  readSheet,
  setSheetVisibility,
  sheetRegionOf,
} from './support/sheets';
import { boardOf } from './support/tables';

// The Lork sheet as a real template: built by fixtures/ficha-lork/build-lksheet.ts from the
// sources in fixtures/ficha-lork/modelo (files, manifest with three permissions and four bars,
// and the fonts as assets).
const LORK_FILE = fileURLToPath(new URL('./fixtures/ficha-lork.lksheet', import.meta.url));
const PICTURE = fileURLToPath(new URL('./fixtures/token.png', import.meta.url));
const TEMPLATE = 'Ficha de Lork';
const SHEET = 'Ficha de Lork · Lyra';

/** Ana imports the `.lksheet` through "Novo item" → "Modelo de ficha", reading what it asks for
 *  first, then closes the library (the editor of the new template opens in it). */
async function importLorkTemplate(admin: Page): Promise<void> {
  const library = await openLibrary(admin);
  await importSheetTemplate(library, LORK_FILE);
  const confirm = admin.getByRole('dialog', { name: 'Importar modelo de ficha' });
  await expect(confirm.getByRole('textbox', { name: 'Nome do modelo' })).toHaveValue(TEMPLATE);
  await expect(
    confirm.getByRole('list', { name: 'Permissões pedidas' }).getByRole('listitem'),
  ).toHaveText(['Gravar CA e CD do personagem', 'Trocar o retrato', 'Enviar imagens']);
  await expect(confirm).toContainText(
    'Barras esperadas: HP (até 12), MP (até 10), EF (até 10), ES (até 15)',
  );
  await expect(confirm).toContainText('4 fontes e imagens vão junto.');
  await confirm.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(confirm).toBeHidden();
  await library.getByRole('button', { name: 'Fechar biblioteca' }).click();
  await expect(boardOf(admin)).toBeVisible();
}

function playerCardOf(page: Page, character: string): Locator {
  return page
    .getByRole('region', { name: /^Jogadores/ })
    .getByRole('article', { name: character, exact: true });
}

/** One bar of Lyra on the master's card of the "Na mesa" tab ("Editar MP de Lyra"). */
async function lyraBarOf(admin: Page, label: string): Promise<Locator> {
  await admin.getByRole('tab', { name: 'Na mesa' }).click();
  return playerCardOf(admin, 'Lyra').getByRole('button', { name: `Editar ${label} de Lyra` });
}

async function expectLyraBars(admin: Page, bars: Readonly<Record<string, string>>): Promise<void> {
  for (const [label, text] of Object.entries(bars)) {
    await expect(await lyraBarOf(admin, label)).toContainText(text);
  }
}

/** The sheet's own tab (by state inside the frame, never a navigation). */
async function showSheetPage(sheet: FrameLocator, page: string): Promise<void> {
  await sheet.getByRole('tab', { name: page, exact: true }).click();
  await expect(sheet.getByRole('tabpanel', { name: page, exact: true })).toBeVisible();
}

/** "Adicionar habilidade" on the Habilidades tab, named; answers the new entry. */
async function addSkill(sheet: FrameLocator, name: string): Promise<Locator> {
  await showSheetPage(sheet, 'Habilidades');
  await sheet.getByRole('button', { name: 'Adicionar habilidade' }).click();
  const skill = sheet.locator('[data-entry^="hab:"]');
  await expect(skill).toHaveCount(1);
  await skill.getByRole('textbox', { name: 'Nome da habilidade' }).fill(name);
  return skill;
}

type SavedSkill = Readonly<{ nome?: string; img?: string; custos?: Record<string, unknown> }>;

/** The skills of the sheet as the server keeps them (the `hab` list of the values). */
async function savedSkillsOf(
  page: Page,
  campaignId: string,
  sheetId: string,
): Promise<SavedSkill[]> {
  const { values } = await readSheet(page, campaignId, sheetId);
  const skills = (values as { hab?: Record<string, SavedSkill> } | null)?.hab ?? {};
  return Object.values(skills);
}

async function savedCostsOf(page: Page, campaignId: string, sheetId: string): Promise<string[]> {
  const [skill] = await savedSkillsOf(page, campaignId, sheetId);
  const costs = Object.values(skill?.custos ?? {}) as { bar?: string; v?: string }[];
  return costs.map(({ bar, v }) => `${bar} ${v}`).sort();
}

test('Ana imports the Lork sheet and gives it to Lyra; the armor Bia wears is the CA of Lyra', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const { admin, bia } = await openSheetTable(newPlayerPage, false);
  await importLorkTemplate(admin);
  const { name } = await newSheetOnToken(admin, 'Lyra', TEMPLATE);
  expect(name).toBe(SHEET);
  // Giving the sheet made the bars of its manifest, full; Lyra's own PV stays.
  await expectLyraBars(admin, {
    PV: '10 / 10',
    HP: '12 / 12',
    MP: '10 / 10',
    EF: '10 / 10',
    ES: '15 / 15',
  });

  const sheet = await openSheetFromCard(bia, 'Lyra', SHEET);
  await expect(sheet.getByRole('tab', { name: 'Perfil', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(sheet.getByRole('textbox', { name: 'MP', exact: true })).toHaveValue('10');
  await showSheetPage(sheet, 'Inventário');
  await sheet.getByRole('button', { name: 'Adicionar armadura' }).click();
  const armor = sheet.locator('[data-entry^="armaduras:"]');
  await expect(armor).toHaveCount(1);
  await armor.getByRole('textbox', { name: 'Nome da armadura' }).fill('Couro batido');
  await armor.getByRole('textbox', { name: 'Valor', exact: true }).fill('14');
  await armor.getByRole('checkbox', { name: 'Em uso: é a CA do personagem' }).check();
  await expect(armor.locator('.ca-val')).toHaveText('14');

  // The sheet wrote it by character.set: Ana's card of Lyra reads CA 14.
  await admin.getByRole('tab', { name: 'Na mesa' }).click();
  await expect(
    playerCardOf(admin, 'Lyra').getByRole('textbox', { name: 'CA de Lyra' }),
  ).toHaveValue('14');
});

test('"Usar habilidade" spends MP and EF at once, refuses without balance, and the comfortable long rest fills them back', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const { admin, bia, campaignId } = await openSheetTable(newPlayerPage, false);
  await importLorkTemplate(admin);
  const { sheetId } = await newSheetOnToken(admin, 'Lyra', TEMPLATE);
  const sheet = await openSheetFromCard(bia, 'Lyra', SHEET);
  const skill = await addSkill(sheet, 'Golpe arcano');
  await skill.getByRole('button', { name: 'Vincular barra', exact: true }).click();
  await expect(skill.locator('.cost')).toHaveCount(1);
  await skill.getByRole('button', { name: 'Vincular barra', exact: true }).click();
  await expect(skill.locator('.cost')).toHaveCount(2);
  await skill.getByRole('combobox', { name: 'Barra que paga o custo' }).nth(1).selectOption('EF');
  await skill.getByRole('textbox', { name: 'Quanto sai da barra' }).nth(0).fill('6');
  await skill.getByRole('textbox', { name: 'Quanto sai da barra' }).nth(1).fill('6');
  await expect.poll(() => savedCostsOf(bia, campaignId, sheetId)).toEqual(['EF 6', 'MP 6']);

  const used = skill.getByRole('status');
  await skill.getByRole('button', { name: 'Usar habilidade' }).click();
  await expect(used).toHaveText('Gastou 6 de MP, 6 de EF.');
  await expectLyraBars(admin, { MP: '4 / 10', EF: '4 / 10' });

  // MP 4 cannot pay 6: bars.spend is all or nothing, so EF keeps its 4 too.
  await skill.getByRole('button', { name: 'Usar habilidade' }).click();
  await expect(used).toHaveText('MP insuficiente: tem 4, precisa de 6.');
  await expectLyraBars(admin, { MP: '4 / 10', EF: '4 / 10' });

  await showSheetPage(sheet, 'Regras');
  await sheet.getByRole('button', { name: 'Descansar: longo em lugar confortável' }).click();
  await expect(sheet.locator('#rest-msg')).toHaveText(
    'Descanso longo em lugar confortável: MP 4 → 10, EF 4 → 10, ES 15 → 7.',
  );
  await expectLyraBars(admin, { MP: '10 / 10', EF: '10 / 10', ES: '7 / 15' });
});

test('the image Bia puts on a skill is seen by Caio on a table sheet, which he cannot edit', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const { admin, bia, caio, campaignId } = await openSheetTable(newPlayerPage, true);
  if (caio === null) throw new Error('this scenario needs Caio at the table');
  await importLorkTemplate(admin);
  const { sheetId } = await newSheetOnToken(admin, 'Lyra', TEMPLATE);
  const sheet = await openSheetFromCard(bia, 'Lyra', SHEET);
  const skill = await addSkill(sheet, 'Bola de fogo');
  await skill.locator('[data-img] input[type="file"]').setInputFiles(PICTURE);
  await expect(skill.locator('[data-img] img')).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(async () => (await savedSkillsOf(bia, campaignId, sheetId))[0]?.img ?? '')
    .toMatch(/^[0-9a-f-]{36}$/);

  await setSheetVisibility(admin, 'Lyra', 'A mesa toda (só leitura)');
  const seen = await openSheetFromCard(caio, 'Lyra', SHEET);
  await expect(sheetRegionOf(caio, SHEET)).toContainText('Somente leitura');
  await expect(seen.getByRole('textbox', { name: 'Nome do personagem' })).toBeDisabled();
  await showSheetPage(seen, 'Habilidades');
  const seenSkill = seen.locator('[data-entry^="hab:"]');
  await expect(seenSkill.getByRole('textbox', { name: 'Nome da habilidade' })).toHaveValue(
    'Bola de fogo',
  );
  await expect(seenSkill.getByRole('textbox', { name: 'Nome da habilidade' })).toBeDisabled();
  await expect(seen.getByRole('button', { name: 'Adicionar habilidade' })).toBeHidden();
  // The image came by assets.read (the sheet_image is readable by whoever reads the sheet).
  const image = seenSkill.locator('[data-img] img');
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => image.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth))
    .toBeGreaterThan(0);
  expect(await patchSheetValues(caio, campaignId, sheetId, { f: { nome: 'Caio' } })).toBe(403);
});
