import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './dev-players';
import { adminCredentials, signIn } from './sign-in';
import { boardOf, createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './tables';

export type ChatTable = Readonly<{ admin: Page; bia: Page; caio: Page | null }>;

/** Opens a fresh table with Bia and optionally Caio, each in their own context, on Chat.
 * Example: `const { admin, bia } = await openChatTable(newPlayerPage)` */
export async function openChatTable(
  newPlayerPage: () => Promise<Page>,
  withCaio = false,
): Promise<ChatTable> {
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  const name = `Mesa chat ${Date.now()}`;
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  const caio = withCaio ? await newPlayerPage() : null;
  if (caio) {
    await signIn(caio, CAIO);
    await joinByCodeAndEnter(caio, code, admin);
  }
  await enterFromTheList(admin, name);
  for (const page of [admin, bia, caio]) if (page) await openChatTab(page);
  return { admin, bia, caio };
}

/** Selects the room's Chat tab, including its optional unread counter.
 * Example: `await openChatTab(bia)` */
export async function openChatTab(page: Page): Promise<void> {
  await expect(boardOf(page)).toBeVisible();
  await page.getByRole('tab', { name: /^Chat/ }).click();
  await expect(page.getByRole('combobox', { name: 'Mensagem' })).toBeVisible();
}

/** The conversation feed; works for the room and for the detached popup.
 * Example: `await expect(chatFeedOf(bia)).toContainText('Olá')` */
export function chatFeedOf(page: Page): Locator {
  return page.getByRole('log', { name: /^Mensagens:/ });
}

/** Sends through the real composer button so open suggestions cannot consume Enter.
 * Example: `await sendChat(bia, '/r 1d20')` */
export async function sendChat(page: Page, text: string): Promise<void> {
  const field = page.getByRole('combobox', { name: 'Mensagem' });
  await field.fill(text);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(field).toHaveValue('');
}

/** Selects a conversation by its title, allowing an unread-count suffix.
 * Example: `await selectConversation(bia, 'Caio')` */
export async function selectConversation(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Conversas' })
    .getByRole('button', {
      name: new RegExp(`^${name}(?:$|,)`),
    })
    .click();
  await expect(chatFeedOf(page)).toHaveAccessibleName(`Mensagens: ${name}`);
}
