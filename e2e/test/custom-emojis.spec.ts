import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { chatFeedOf, openChatTable, sendChat } from './support/chat';
import { setPlanOf } from './support/plans';
import { test } from './support/player-pages';

const GIF = path.join(import.meta.dirname, 'fixtures', 'aura.gif');

// Bia's own emojis, made over HTTP with her cookie (the screen has its own spec): the e2e proves
// the trip of a message, not the form. Taken off at the end so a rerun starts clean.
async function createEmoji(bia: Page, name: string): Promise<string> {
  const response = await bia.request.post(`/api/account/custom-emojis?name=${name}`, {
    headers: { 'content-type': 'image/gif' },
    data: await readFile(GIF),
  });
  expect(response.status(), `create :${name}:`).toBe(201);
  const body = (await response.json()) as { emojis: { id: string; name: string }[] };
  const created = body.emojis.find((emoji) => emoji.name === name);
  if (!created) throw new Error(`expected :${name}: in ${JSON.stringify(body)}`);
  return created.id;
}

async function removeEmojisOf(page: Page): Promise<void> {
  const list = await page.request.get('/api/account/custom-emojis');
  const body = (await list.json()) as { emojis: { id: string }[] };
  for (const { id } of body.emojis) {
    await page.request.delete(`/api/account/custom-emojis/${id}`);
  }
}

async function framesOf(page: Page, emojiId: string): Promise<boolean> {
  const response = await page.request.get(`/api/custom-emojis/${emojiId}`);
  const bytes = await response.body();
  // An animated WebP carries the ANIM chunk; a still one does not.
  return bytes.includes(Buffer.from('ANIM'));
}

test('a custom emoji of Bia: Caio sees it in the chat, cannot pick it, and it goes still when she leaves the Lenda', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, bia, caio } = await openChatTable(newPlayerPage, true);
  if (!caio) throw new Error('expected Caio at the table');
  await setPlanOf(admin, 'bia', 'lenda');
  await removeEmojisOf(bia);
  const festa = await createEmoji(bia, 'festa');
  try {
    await bia.reload();
    await sendChat(bia, 'bora :festa:');

    const picture = chatFeedOf(caio).getByRole('img', { name: ':festa:' });
    await expect(picture).toBeVisible();
    await expect(picture).toHaveAttribute('src', `/api/custom-emojis/${festa}`);
    expect(await framesOf(caio, festa)).toBe(true);

    await caio.getByRole('button', { name: 'Memes e smileys' }).click();
    await expect(caio.getByRole('tab', { name: 'Meus emojis' })).toHaveCount(0);
    await caio.keyboard.press('Escape');

    await setPlanOf(admin, 'bia', 'narrador');
    expect(await framesOf(caio, festa)).toBe(false);
  } finally {
    await removeEmojisOf(bia);
    await setPlanOf(admin, 'bia', 'amigo_do_dono');
  }
});
