import { expect, type Page } from '@playwright/test';
import {
  chatBarOf,
  chatDrawerOf,
  chatFeedOf,
  collapseChat,
  openChatDrawer,
  openChatTable,
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
  await openChatDrawer(bia);
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
  // The open drawer covers the centre cell, where the token and its balloon are.
  await collapseChat(admin);
  await bia.getByRole('button', { name: 'Falar como: Você', exact: true }).click();
  await bia.getByRole('menuitemradio', { name: 'Lyra', exact: true }).click();
  await expect(bia.getByRole('button', { name: 'Falar como: Lyra' })).toBeVisible();
  const before = await brightBoardPixels(admin);
  await sendChat(bia, 'Sigam minha voz!');
  await expect.poll(() => brightBoardPixels(admin)).toBeGreaterThan(before + 500);
  await expect.poll(() => brightBoardPixels(admin), { timeout: 10_000 }).toBeLessThan(before + 100);
  await openChatDrawer(admin);
  const message = chatFeedOf(admin).getByRole('listitem').filter({ hasText: 'Sigam minha voz!' });
  await expect(message).toContainText('Lyra');
  await expect(message).toContainText('Bia');
});

test('detached window: popup menus and sending work, changing the room tab keeps it open, closing brings the chat back to the bar', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const { admin, bia } = await openChatTable(newPlayerPage);
  const popupOpened = admin.waitForEvent('popup');
  await chatDrawerOf(admin).getByRole('button', { name: 'Abrir em outra janela' }).click();
  const popup = await popupOpened;
  await expect(popup).toHaveURL(/\/chat-window\.html$/);
  const pin = popup.getByRole('button', { name: 'Sempre por cima' });
  await expect(pin).toBeDisabled();
  await expect(pin).toHaveAttribute(
    'title',
    'Sempre por cima: disponível no aplicativo para Windows.',
  );
  await expect(
    chatBarOf(admin).getByText('Chat aberto em outra janela', { exact: true }),
  ).toBeVisible();
  await expect(chatDrawerOf(admin)).toHaveCount(0);
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
  await openChatDrawer(admin);
  await expect(
    chatDrawerOf(admin).getByRole('button', { name: 'Abrir em outra janela' }),
  ).toBeVisible();
  await expect(admin.getByText('Chat aberto em outra janela', { exact: true })).toHaveCount(0);
});

test('another panel tab: Bia on "Combate" sees the new message in the bar, a gold whisper and the tab title; the drawer survives F5 and the bar stays in focus mode', async ({
  newPlayerPage,
}) => {
  test.setTimeout(150_000);
  const { bia, caio } = await openChatTable(newPlayerPage, true);
  if (!caio) throw new Error('expected Caio at the chat table');
  await collapseChat(bia);
  await bia.getByRole('tab', { name: 'Combate', exact: true }).click();

  await sendChat(caio, 'Vou abrir a porta.');
  const preview = bia
    .getByRole('list', { name: 'Mensagens novas' })
    .getByRole('button', { name: 'Caio: Vou abrir a porta.' });
  await expect(preview).toBeVisible();
  await expect(chatBarOf(bia)).toContainText('Caio: Vou abrir a porta.');
  await expect(
    chatBarOf(bia).getByRole('button', { name: 'Abrir chat' }),
  ).toHaveAccessibleDescription('1 mensagem não lida');
  await expect(bia).toHaveTitle(/^\(1\) Lorkarium · Mesa chat \d+$/);
  await preview.click();
  await expect(chatFeedOf(bia)).toHaveAccessibleName('Mensagens: Mesa');
  await expect(bia).toHaveTitle(/^Lorkarium · Mesa chat \d+$/);
  await collapseChat(bia);

  await sendChat(caio, '/w Bia Cuidado com o ogro.');
  const notices = bia.getByRole('list', { name: 'Avisos importantes' });
  const whisper = notices.getByRole('button', { name: /Cuidado com o ogro\./ });
  await expect(whisper).toContainText('Sussurro na Mesa');
  await expect(bia).toHaveTitle(/^\(1!\) Lorkarium · Mesa chat \d+$/);
  await whisper.click();
  await expect(chatFeedOf(bia)).toContainText('Cuidado com o ogro.');
  await expect(notices).toHaveCount(0);
  await expect(bia).toHaveTitle(/^Lorkarium · Mesa chat \d+$/);

  await expectDrawerSurvivesReload(bia);

  await collapseChat(bia);
  await boardOf(bia).focus();
  await bia.keyboard.press('f');
  await expect(bia.getByRole('region', { name: 'Topo da sala' })).toBeHidden();
  await sendChat(caio, 'Ainda estão aí?');
  await expect(chatBarOf(bia)).toContainText('Caio: Ainda estão aí?');
});

// Two steps down (↓) keep the height inside the board on any viewport: going up could hit the
// 70% ceiling, and the reload would then prove the ceiling, not the remembered height.
async function expectDrawerSurvivesReload(page: Page): Promise<void> {
  const handle = chatDrawerOf(page).getByRole('separator', { name: 'Altura do chat' });
  const before = Number(await handle.getAttribute('aria-valuenow'));
  await handle.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const height = String(before - 48);
  await expect(handle).toHaveAttribute('aria-valuenow', height);
  await page.reload();
  await expect(chatDrawerOf(page).getByRole('combobox', { name: 'Mensagem' })).toBeVisible();
  await expect(handle).toHaveAttribute('aria-valuenow', height);
}

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

// Count the balloon's light surface on the actual Pixi canvas, above its bottom 40%: the chat bar
// and the previews of new messages float there, over the canvas, and their text is light too.
async function brightBoardPixels(page: Page): Promise<number> {
  const box = await boardOf(page).locator('canvas').first().boundingBox();
  if (box === null) throw new Error('The board canvas has no box: expected it on screen.');
  const png = await page.screenshot({ clip: { ...box, height: box.height * 0.6 } });
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
