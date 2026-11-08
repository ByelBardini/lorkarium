import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { meanChannelsAt } from './support/canvas-pixels';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { chooseController } from './support/token-cards';

const SAVED_COLOR = '#336699';

function customColorTileOf(scope: Locator): Locator {
  return scope.getByRole('button', { name: /^Cor personalizada/ });
}

function customColorPanelOf(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Cor personalizada' });
}

function drawStylePanelOf(page: Page): Locator {
  return page.getByRole('region', { name: 'Estilo do desenho' });
}

function fillColorsOf(page: Page): Locator {
  return drawStylePanelOf(page).getByRole('radiogroup', { name: 'Preenchimento' });
}

// How much bluer than red the square of the screen at that cell is: #336699 is clearly blue, and
// neither the empty board nor the neutral fog is.
async function blueOverRedAt(page: Page, col: number, row: number): Promise<number> {
  const { r, b } = await meanChannelsAt(page, await cellCenterOf(page, col, row));
  return b - r;
}

async function openDrawTool(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Desenhar (B)' }).click();
  await drawStylePanelOf(page).getByRole('radio', { name: 'Quadrado' }).click();
}

async function saveAndUseColorInTheFill(page: Page): Promise<void> {
  await customColorTileOf(fillColorsOf(page)).click();
  const panel = customColorPanelOf(page);
  await panel.getByLabel('Código da cor').fill(SAVED_COLOR);
  await panel.getByRole('button', { name: 'Salvar' }).click();
  await expect(panel.getByRole('button', { name: SAVED_COLOR, exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Usar cor' }).click();
  await expect(panel).toBeHidden();
}

async function setVisionDark(master: Page): Promise<void> {
  await master.getByRole('button', { name: 'Configurar cena' }).click();
  const dialog = master.getByRole('dialog', { name: 'Configurar cena' });
  await dialog
    .getByRole('radiogroup', { name: 'Visão dos tokens' })
    .getByRole('radio', { name: 'Escuro' })
    .click();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

// Without darkvision Caio sees only what is lit, so the floor shows the color of the light.
async function createBlindTokenForCaio(master: Page): Promise<void> {
  await master.getByRole('button', { name: 'Novo token' }).click();
  const dialog = master.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await chooseController(dialog, 'Caio');
  await dialog.getByRole('tab', { name: 'Visão e luz' }).click();
  await dialog.getByRole('switch', { name: 'Enxerga no escuro' }).click();
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

test('custom color: saved once by Bia, reused elsewhere after F5, seen by Caio with an empty list of their own, and deleting it repaints nothing', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const name = `Mesa de cores ${Date.now()}`;
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(bia, BIA);
  const code = await createTableAndReadCode(bia, name);
  await signIn(caio, CAIO);
  await joinByCodeAndEnter(caio, code, bia);
  await enterFromTheList(bia, name);

  // Bia saves the color in the drawing panel and fills a square with it, past the panel's columns.
  await openDrawTool(bia);
  await saveAndUseColorInTheFill(bia);
  await expect(customColorTileOf(fillColorsOf(bia))).toHaveAccessibleName(
    `Cor personalizada: ${SAVED_COLOR}`,
  );
  await dragBetweenCells(bia, [5, 2], [7, 4]);

  await expect(
    caio.getByRole('list', { name: 'Desenhos na cena' }).getByRole('listitem'),
  ).toHaveText(['Quadrado, coluna 6, linha 3']);
  await expect.poll(() => blueOverRedAt(caio, 6, 3)).toBeGreaterThan(0.05);

  // The list belongs to the account: Caio, at the same table, has no saved color.
  await openDrawTool(caio);
  await customColorTileOf(fillColorsOf(caio)).click();
  await expect(customColorPanelOf(caio).getByText('Nenhuma cor salva ainda.')).toBeVisible();
  await caio.keyboard.press('Escape');
  await expect(customColorPanelOf(caio)).toBeHidden();

  // After an F5, the color is still on Bia's list and works on the lights panel, another selector.
  await bia.reload();
  await createBlindTokenForCaio(bia);
  await setVisionDark(bia);
  await bia.keyboard.press('l');
  const lightPanel = bia.getByRole('region', { name: 'Luz' });
  await customColorTileOf(lightPanel).click();
  const panel = customColorPanelOf(bia);
  await panel.getByRole('button', { name: SAVED_COLOR, exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(customColorTileOf(lightPanel)).toHaveAccessibleName(
    `Cor personalizada: ${SAVED_COLOR}`,
  );
  const torch = await cellCenterOf(bia, 12, 6);
  await bia.mouse.click(torch.x, torch.y);

  // The light of that color tints the floor between Lyra, at (10, 6), and the torch, for Caio.
  await expect.poll(() => blueOverRedAt(caio, 11, 6)).toBeGreaterThan(0.05);

  // Bia deletes it from the list: the list empties and the light keeps its own copy of the hex.
  await customColorTileOf(lightPanel).click();
  await panel.getByRole('button', { name: `Excluir ${SAVED_COLOR}` }).click();
  await expect(panel.getByText('Nenhuma cor salva ainda.')).toBeVisible();
  await bia.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  await caio.reload();
  await expect(
    caio.getByRole('list', { name: 'Desenhos na cena' }).getByRole('listitem'),
  ).toHaveText(['Quadrado, coluna 6, linha 3']);
  await expect.poll(() => blueOverRedAt(caio, 11, 6)).toBeGreaterThan(0.05);
  await expect.poll(() => blueOverRedAt(bia, 6, 3)).toBeGreaterThan(0.05);
});
