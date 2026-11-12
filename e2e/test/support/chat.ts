import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './dev-players';
import { adminCredentials, signIn } from './sign-in';
import { boardOf, createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './tables';

export type ChatTable = Readonly<{ admin: Page; bia: Page; caio: Page | null }>;

/** Opens a fresh table with Bia and optionally Caio, each in their own context, with the chat
 * drawer open at the foot of the board.
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
  for (const page of [admin, bia, caio]) if (page) await openChatDrawer(page);
  return { admin, bia, caio };
}

/** The chat bar at the foot of the board ("Abrir chat", or "Trazer de volta" when detached).
 * Example: `await chatBarOf(bia).getByRole('button', { name: 'Abrir chat' }).click()` */
export function chatBarOf(page: Page): Locator {
  return page.getByRole('region', { name: 'Chat da mesa', exact: true });
}

/** The open chat drawer over the board, with the whole chat panel.
 * Example: `await chatDrawerOf(bia).getByRole('button', { name: 'Abrir em outra janela' }).click()` */
export function chatDrawerOf(page: Page): Locator {
  return page.getByRole('region', { name: 'Conversa', exact: true });
}

/** Opens the chat drawer from the bar; a drawer already open (it stays open across the panel's
 * tabs and is remembered by the room) is left as it is.
 * Example: `await openChatDrawer(bia)` */
export async function openChatDrawer(page: Page): Promise<void> {
  await expect(boardOf(page)).toBeVisible();
  const open = chatBarOf(page).getByRole('button', { name: 'Abrir chat', exact: true });
  const composer = chatDrawerOf(page).getByRole('combobox', { name: 'Mensagem' });
  // A chat coming back from its window reopens the drawer a moment later: wait for either one,
  // or the bar's "Trazer de volta" reads as "no drawer" and the click waits for a bar that left.
  await expect(open.or(composer)).toBeVisible();
  if ((await composer.count()) === 0) await open.click();
  await expect(composer).toBeVisible();
}

/** "Recolher chat": the drawer closes and the bar is back at the foot of the board.
 * Example: `await collapseChat(admin)` */
export async function collapseChat(page: Page): Promise<void> {
  await chatDrawerOf(page).getByRole('button', { name: 'Recolher chat', exact: true }).click();
  await expect(chatBarOf(page).getByRole('button', { name: 'Abrir chat' })).toBeVisible();
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
