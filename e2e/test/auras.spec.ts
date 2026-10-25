import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { meanChannelsAt, type Channels } from './support/canvas-pixels';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { cardOf, chooseController, openCard } from './support/token-cards';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';

// Two 64 × 64 frames of 300 ms, red then blue (made once by sharp and versioned).
const AURA_GIF = fileURLToPath(new URL('./fixtures/aura.gif', import.meta.url));
// Everything that does not prove the animation runs still: no continuous render on the CI.
const STILL = { reducedMotion: 'reduce' } as const;

type Cell = readonly [number, number];

type Frame = 'red' | 'blue';
type Point = Readonly<{ x: number; y: number }>;

// With software GL the GIF's frames swap seconds apart on screen, not every 300 ms.
const FRAME_SWAP_TIMEOUT_MS = 60_000;
const STILLED_WINDOW_MS = 6_000;

// The cell of a token, read from its card ("Coluna 11, linha 6" → (10, 5)).
async function cellOf(page: Page, name: string): Promise<Cell> {
  await openCard(page, name);
  const text = (await cardOf(page, name).textContent()) ?? '';
  const match = /Coluna (\d+), linha (\d+)/.exec(text);
  if (!match) throw new Error(`the card of ${name} shows no cell: ${text}`);
  return [Number(match[1]) - 1, Number(match[2]) - 1];
}

async function channelsAtCell(page: Page, [col, row]: Cell): Promise<Channels> {
  return meanChannelsAt(page, await cellCenterOf(page, col, row), 6);
}

// How much warmer than cold a point is: the gold, the fire and the red frame lead with red.
const warmth = ({ r, b }: Channels): number => r - b;

async function openAuraDialog(page: Page, name: string): Promise<ReturnType<Page['getByRole']>> {
  const [col, row] = await cellOf(page, name);
  const at = await cellCenterOf(page, col, row);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page
    .getByRole('menu', { name: `Ações de ${name}` })
    .getByRole('menuitem', { name: 'Aura…' })
    .click();
  return page.getByRole('dialog', { name: `Aura de ${name}` });
}

async function saveAura(dialog: ReturnType<Page['getByRole']>): Promise<void> {
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

async function createGoblin(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Goblin');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

async function createLyra(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await chooseController(dialog, 'Bia');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

// Which frame of the GIF (red, blue) a point shows; `null` when it is neither.
function frameOf({ r, b }: Channels): Frame | null {
  if (Math.abs(r - b) <= 0.2) return null;
  return r > b ? 'red' : 'blue';
}

// The frames a point shows over `ms` of wall time. Time, not a count of reads: with software GL
// (the CI runner) a screenshot of an animating board costs half a second and more.
async function framesSeenDuring(page: Page, at: Point, ms: number): Promise<ReadonlySet<Frame>> {
  const seen = new Set<Frame>();
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const frame = frameOf(await meanChannelsAt(page, at, 6));
    if (frame) seen.add(frame);
    await page.waitForTimeout(150);
  }
  return seen;
}

// How far apart two colors are (each channel 0–1).
function colorDistance(a: Channels, b: Channels): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

test('the aura of whoever controls a token reaches the table, follows it, animates and stops', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const name = `Mesa auras ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage(STILL);
  const caio = await newPlayerPage(STILL);
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  for (const [page, who] of [
    [bia, BIA],
    [caio, CAIO],
  ] as const) {
    await signIn(page, who);
    await joinByCodeAndEnter(page, code, admin);
  }
  await enterFromTheList(admin, name);

  await createGoblin(admin);
  const goblinFrom = await cellOf(admin, 'Goblin');
  await dragBetweenCells(admin, goblinFrom, [3, 3]);
  await expect.poll(() => cellOf(admin, 'Goblin')).toEqual([3, 3]);
  await createLyra(admin);
  const [col, row] = await cellOf(bia, 'Lyra');
  const near: Cell = [col - 1, row];
  const far: Cell = [col - 4, row];
  const plainNear = warmth(await channelsAtCell(caio, near));
  const plainFar = warmth(await channelsAtCell(caio, far));

  // Bia: Cor Ouro, 3 m (2 cells on the 1.5 m grid) past the edge.
  const gold = await openAuraDialog(bia, 'Lyra');
  await gold.getByRole('radio', { name: 'Cor' }).click();
  await gold.getByRole('radio', { name: 'Ouro' }).click();
  await gold.getByLabel(/^Raio além da borda/).fill('3');
  await saveAura(gold);
  for (const page of [admin, caio]) {
    await expect
      .poll(async () => warmth(await channelsAtCell(page, near)))
      .toBeGreaterThan(plainNear + 0.08);
  }
  expect(Math.abs(warmth(await channelsAtCell(caio, far)) - plainFar)).toBeLessThan(0.03);

  // The aura goes along: two cells to the right, the left neighbor is out of its reach.
  await dragBetweenCells(bia, [col, row], [col + 2, row]);
  await expect
    .poll(async () => warmth(await channelsAtCell(caio, [col + 3, row])))
    .toBeGreaterThan(plainNear + 0.08);
  await expect
    .poll(async () => Math.abs(warmth(await channelsAtCell(caio, near)) - plainNear))
    .toBeLessThan(0.03);

  // Ana: the animated GIF as the goblin's aura; it plays while "Animar auras" is on.
  const image = await openAuraDialog(admin, 'Goblin');
  await image.getByRole('radio', { name: 'Imagem' }).click();
  await image.getByLabel('Arquivo de imagem').setInputFiles(AURA_GIF);
  await expect(image.getByRole('img', { name: 'Imagem escolhida' })).toBeVisible();
  await saveAura(image);
  // One read per call, the frames gathered across calls: the red and then the blue must show.
  const beside = await cellCenterOf(admin, 4, 3);
  const played = new Set<Frame>();
  await expect
    .poll(
      async () => {
        const frame = frameOf(await meanChannelsAt(admin, beside, 6));
        if (frame) played.add(frame);
        return played.size;
      },
      { timeout: FRAME_SWAP_TIMEOUT_MS },
    )
    .toBe(2);
  const animate = admin.getByRole('button', { name: 'Animar auras' });
  await expect(animate).toHaveAttribute('aria-pressed', 'true');
  await animate.click();
  await expect(animate).toHaveAttribute('aria-pressed', 'false');
  expect((await framesSeenDuring(admin, beside, STILLED_WINDOW_MS)).size).toBe(1);

  // Bia: Fogo in its natural tone, 2 m: the ring around is warm, not the gold any more.
  const goldLook = await channelsAtCell(caio, [col + 3, row]);
  const fire = await openAuraDialog(bia, 'Lyra');
  await fire.getByRole('radio', { name: 'Efeito' }).click();
  await fire.getByRole('radio', { name: 'Fogo' }).click();
  await expect(fire.getByRole('radio', { name: 'Natural' })).toBeChecked();
  await fire.getByLabel(/^Raio além da borda/).fill('2');
  await saveAura(fire);
  await expect
    .poll(async () => {
      const look = await channelsAtCell(caio, [col + 3, row]);
      // The whole color, not one channel: the still frame of the fire may keep the gold's green.
      return colorDistance(look, goldLook) > 0.06 && warmth(look) > plainNear + 0.1;
    })
    .toBe(true);

  // F5: the aura comes back from the snapshot; Caio has no "Aura…" on Bia's token.
  await caio.reload();
  await expect
    .poll(async () => warmth(await channelsAtCell(caio, [col + 3, row])))
    .toBeGreaterThan(plainNear + 0.1);
  const [lyraCol, lyraRow] = await cellOf(caio, 'Lyra');
  const lyraAt = await cellCenterOf(caio, lyraCol, lyraRow);
  await caio.mouse.click(lyraAt.x, lyraAt.y, { button: 'right' });
  await caio.waitForTimeout(500);
  await expect(caio.getByRole('menuitem', { name: 'Aura…' })).toHaveCount(0);
});
