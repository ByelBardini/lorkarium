import { expect, type Page } from '@playwright/test';
import {
  chatFeedOf,
  openChatTable,
  openChatTab,
  selectConversation,
  sendChat,
} from './support/chat';
import { test } from './support/player-pages';
import { boardOf } from './support/tables';
import { createTokenFor } from './support/token-cards';

test('table and whispers: public messages reach everyone; a whisper reaches Bia and excludes Caio', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const { admin, bia, caio } = await openChatTable(newPlayerPage, true);
  if (!caio) throw new Error('expected Caio at the chat table');
  await sendChat(admin, 'A porta está aberta.');
  for (const page of [admin, bia, caio])
    await expect(chatFeedOf(page)).toContainText('A porta está aberta.');
  await sendChat(bia, 'Vou entrar primeiro.');
  await expect(chatFeedOf(admin)).toContainText('Vou entrar primeiro.');
  await sendChat(admin, '/w Bia Há uma armadilha.');
  await expect(chatFeedOf(bia)).toContainText('Há uma armadilha.');
  await expect(chatFeedOf(bia)).toContainText('sussurro pra você');
  await sendChat(admin, 'Todos podem avançar.');
  await expect(chatFeedOf(caio)).toContainText('Todos podem avançar.');
  await expect(chatFeedOf(caio)).not.toContainText('Há uma armadilha.');
});

test('private and group: the master sees neither; a new group reaches Caio only with its first message', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const { admin, bia, caio } = await openChatTable(newPlayerPage, true);
  if (!caio) throw new Error('expected Caio at the chat table');
  await bia.getByRole('button', { name: 'Nova conversa' }).click();
  await bia
    .getByRole('dialog', { name: 'Nova conversa' })
    .getByRole('button', { name: 'Caio', exact: true })
    .click();
  await sendChat(bia, 'Nos encontramos na ponte.');
  await selectConversation(caio, 'Bia');
  await expect(chatFeedOf(caio)).toContainText('Nos encontramos na ponte.');
  await bia.getByRole('button', { name: 'Nova conversa' }).click();
  const dialog = bia.getByRole('dialog', { name: 'Nova conversa' });
  await dialog.getByRole('radio', { name: 'Grupo', exact: true }).click();
  await dialog.getByLabel('Nome do grupo').fill('Patrulha');
  await dialog.getByRole('checkbox', { name: 'Caio', exact: true }).check();
  await dialog.getByRole('button', { name: 'Criar grupo' }).click();
  await expect(caio.getByRole('navigation', { name: 'Conversas' })).not.toContainText('Patrulha');
  await sendChat(bia, 'Plano da patrulha.');
  await selectConversation(caio, 'Patrulha');
  await expect(chatFeedOf(caio)).toContainText('Plano da patrulha.');
  await caio
    .getByRole('navigation', { name: 'Conversas' })
    .getByRole('button', { name: 'Patrulha', exact: true })
    .click({ button: 'right' });
  await caio.getByRole('menuitem', { name: 'Fechar conversa', exact: true }).click();
  await expect(chatFeedOf(caio)).toHaveAccessibleName('Mensagens: Mesa');
  await expect(caio.getByRole('navigation', { name: 'Conversas' })).not.toContainText('Patrulha');
  await sendChat(bia, 'A patrulha continua.');
  await selectConversation(caio, 'Patrulha');
  await expect(chatFeedOf(caio)).toContainText('Plano da patrulha.');
  await expect(chatFeedOf(caio)).toContainText('A patrulha continua.');
  await selectConversation(caio, 'Mesa');
  await caio
    .getByRole('navigation', { name: 'Conversas' })
    .getByRole('button', { name: 'Mesa', exact: true })
    .click({ button: 'right' });
  await expect(caio.getByRole('menuitem', { name: 'Fechar conversa' })).toHaveCount(0);
  await selectConversation(bia, 'Mesa');
  await sendChat(bia, 'Voltamos à mesa.');
  await expect(chatFeedOf(admin)).toContainText('Voltamos à mesa.');
  await expect(chatFeedOf(admin)).not.toContainText('Nos encontramos na ponte.');
  await expect(admin.getByRole('navigation', { name: 'Conversas' })).not.toContainText('Patrulha');
});

test('slash rolls: /r and a saved /ataque produce matching totals in both chat feeds', async ({
  newPlayerPage,
}, testInfo) => {
  test.setTimeout(180_000);
  const { admin, bia } = await openChatTable(newPlayerPage);
  await bia.getByRole('button', { name: 'Atalhos do chat', exact: true }).click();
  const shortcuts = bia.getByRole('dialog', { name: 'Atalhos do chat', exact: true });
  await expect(shortcuts).toContainText('Shift+Enter');
  await expect(shortcuts).toContainText('/r 1d20+5');
  await expect(shortcuts).toContainText('/gr 2d6');
  await expect(shortcuts).toContainText('/rolagem-salva');
  await expect(bia.getByTestId('composer-hint')).toHaveText('Atalhos');
  await bia.screenshot({ path: testInfo.outputPath('chat-shortcuts.png'), animations: 'disabled' });
  await bia.keyboard.press('Escape');
  await expect(shortcuts).toBeHidden();
  await bia.getByRole('tab', { name: 'Dados', exact: true }).click();
  const dice = bia.getByRole('tabpanel', { name: 'Dados' });
  await dice.getByLabel('Fórmula').fill('1d20+5');
  await dice.getByRole('button', { name: 'Salvar esta rolagem' }).click();
  await dice.getByLabel('Nome da rolagem').fill('Ataque');
  await dice.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dice.getByRole('button', { name: 'Rolar Ataque', exact: true })).toBeVisible();
  await openChatTab(bia);
  await sendChat(bia, '/r 1d20');
  await expectMatchingRoll(admin, bia, 1, 20);
  await sendChat(bia, '/ataque');
  await expect(chatFeedOf(admin)).toContainText('Ataque');
  await expect(chatFeedOf(admin).getByTestId('roll-total')).toHaveCount(2);
  await expectMatchingRoll(admin, bia, 6, 25);
  await bia.getByRole('radio', { name: 'Só conversa', exact: true }).click();
  await expect(chatFeedOf(bia).getByTestId('roll-total')).toHaveCount(0);
});

test('character speech: Bia speaks as Lyra and the other browser paints a temporary balloon', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const { admin, bia } = await openChatTable(newPlayerPage);
  await admin.getByRole('tab', { name: 'Combate', exact: true }).click();
  await createTokenFor(admin, 'Lyra', 'Bia');
  await openChatTab(admin);
  await bia.getByRole('button', { name: 'Falar como: Você', exact: true }).click();
  await bia.getByRole('menuitemradio', { name: 'Lyra', exact: true }).click();
  await expect(bia.getByRole('button', { name: 'Falar como: Lyra' })).toBeVisible();
  const before = await brightBoardPixels(admin);
  await sendChat(bia, 'Sigam minha voz!');
  const message = chatFeedOf(admin).getByRole('listitem').filter({ hasText: 'Sigam minha voz!' });
  await expect(message).toContainText('Lyra');
  await expect(message).toContainText('Bia');
  await expect.poll(() => brightBoardPixels(admin)).toBeGreaterThan(before + 500);
  await expect.poll(() => brightBoardPixels(admin), { timeout: 10_000 }).toBeLessThan(before + 100);
});

test('detached window: popup menus and sending work, changing the room tab keeps it open, closing restores Chat', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const { admin, bia } = await openChatTable(newPlayerPage);
  const popupOpened = admin.waitForEvent('popup');
  await admin.getByRole('button', { name: 'Abrir em outra janela' }).click();
  const popup = await popupOpened;
  await expect(popup).toHaveURL(/\/chat-window\.html$/);
  const pin = popup.getByRole('button', { name: 'Sempre por cima' });
  await expect(pin).toBeDisabled();
  await expect(pin).toHaveAttribute(
    'title',
    'Sempre por cima: disponível no aplicativo para Windows.',
  );
  await expect(admin.getByText('Chat aberto em outra janela', { exact: true })).toBeVisible();
  await sendChat(popup, 'Voz da outra janela.');
  await expect(chatFeedOf(bia)).toContainText('Voz da outra janela.');
  await popup.getByRole('button', { name: 'Nova conversa' }).click();
  await popup
    .getByRole('dialog', { name: 'Nova conversa' })
    .getByRole('button', { name: 'Bia', exact: true })
    .click();
  await sendChat(popup, 'Privado pela outra janela.');
  await bia
    .getByRole('navigation', { name: 'Conversas' })
    .getByRole('button', { name: /, 1 não lida$/ })
    .click();
  await expect(chatFeedOf(bia)).toContainText('Privado pela outra janela.');
  await admin.getByRole('tab', { name: 'Dados', exact: true }).click();
  await expect(popup.getByRole('combobox', { name: 'Mensagem' })).toBeVisible();
  await popup.close();
  await openChatTab(admin);
  await expect(admin.getByRole('button', { name: 'Abrir em outra janela' })).toBeVisible();
  await expect(admin.getByText('Chat aberto em outra janela', { exact: true })).toHaveCount(0);
});

async function expectMatchingRoll(
  admin: Page,
  bia: Page,
  minimum: number,
  maximum: number,
): Promise<void> {
  const total = chatFeedOf(admin).getByTestId('roll-total').last();
  await expect(total).toHaveText(/^\d+$/, { timeout: 30_000 });
  const value = (await total.textContent()) ?? '';
  expect(Number(value)).toBeGreaterThanOrEqual(minimum);
  expect(Number(value)).toBeLessThanOrEqual(maximum);
  await expect(chatFeedOf(bia).getByTestId('roll-total').last()).toHaveText(value);
}

// Count the balloon's light surface on the actual Pixi canvas, excluding the DOM chat feed.
async function brightBoardPixels(page: Page): Promise<number> {
  const png = await boardOf(page).locator('canvas').first().screenshot();
  return page.evaluate<number>(`(async () => {
    const image = new Image();
    image.src = 'data:image/png;base64,${png.toString('base64')}';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let bright = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 200 && data[index + 1] > 200 && data[index + 2] > 200) bright += 1;
    }
    return bright;
  })()`);
}
