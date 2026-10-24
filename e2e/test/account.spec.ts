import { expect, type Page } from '@playwright/test';
import {
  authenticatorOf,
  codeAfterStep,
  currentTotpStep,
  openAccount,
  readOwnProfile,
  restoreOwnProfile,
  signOutByMenu,
} from './support/account';
import { altClickCell, cellCenterOf } from './support/board-cells';
import { meanChannelsAt, type Channels } from './support/canvas-pixels';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn, signInThroughTheForm, submitLogin } from './support/sign-in';
import {
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  presenceOf,
} from './support/tables';
import { statusOf } from './support/token-cards';

// Two colors far apart on red × green (MEMBER_COLOR_HEX: rose 0xe58fb4, teal 0x5cc8c0), so the
// ping's dot tells which one it was drawn in; the spec picks the one the admin does not have.
const PING_COLORS = {
  rose: { label: 'Rosa', lead: ({ r, g }: Channels) => r - g },
  teal: { label: 'Verde-água', lead: ({ r, g }: Channels) => g - r },
} as const;
// The dot is 6 world px of radius: a 4 × 4 px square at its center is all fill.
const PING_DOT_SAMPLE_PX = 4;

const NEW_CAIO_PASSWORD = 'caio-senha-nova-e2e';

function shellOf(page: Page) {
  return page.getByRole('navigation', { name: 'Principal' });
}

function recoveryCodeAt(codes: readonly string[], index: number): string {
  const code = codes[index];
  if (code === undefined) {
    throw new Error(`expected 10 recovery codes on screen, received ${codes.length}`);
  }
  return code;
}

test('the new nickname and color reach the table live, and the next ping comes in the new color', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, `Mesa conta ${stamp}`);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, `Mesa conta ${stamp}`);
  const before = await readOwnProfile(admin);
  await expect(presenceOf(bia, before.name)).toHaveAccessibleName('online');

  const nickname = `Ana Rubra ${String(stamp).slice(-4)}`;
  const color = before.color === 'rose' ? PING_COLORS.teal : PING_COLORS.rose;
  try {
    // A second tab of the same session: the room of the admin stays open.
    const account = await admin.context().newPage();
    await openAccount(account);
    const profile = account.getByRole('form', { name: 'Perfil' });
    await profile.getByLabel('Apelido').fill(nickname);
    await profile
      .getByRole('radiogroup', { name: 'Sua cor no mapa' })
      .getByRole('radio', { name: color.label })
      .click();
    await profile.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(
      profile.getByRole('region', { name: 'Alterações do perfil' }).getByRole('status'),
    ).toHaveText('Tudo salvo.');
    await account.close();

    // Bia never reloads: the roster changes by session:memberUpdated.
    await expect(presenceOf(bia, nickname)).toHaveAccessibleName('online');

    const dot = await cellCenterOf(bia, 5, 2);
    await altClickCell(admin, 5, 2);
    await expect(statusOf(bia)).toHaveText(`${nickname} marcou um ponto (coluna 6, linha 3).`);
    // The ping lives 3 s: sample its dot on Bia's canvas while it is there.
    await expect
      .poll(async () => color.lead(await meanChannelsAt(bia, dot, PING_DOT_SAMPLE_PX)), {
        timeout: 2_500,
        intervals: [100],
      })
      .toBeGreaterThan(0.15);
  } finally {
    await restoreOwnProfile(admin, before);
  }
});

test('changing the password signs the other device out on its next navigation', async ({
  newPlayerPage,
}) => {
  test.setTimeout(90_000);
  const here = await newPlayerPage();
  const other = await newPlayerPage();
  // Two sessions of their own: the saved cookie of signIn would be one session in both.
  await signInThroughTheForm(here, CAIO);
  await signInThroughTheForm(other, CAIO);
  let changed = false;
  try {
    await openAccount(here);
    await here.getByRole('button', { name: 'Trocar senha' }).click();
    const dialog = here.getByRole('dialog', { name: 'Trocar senha' });
    await dialog.getByLabel('Senha atual', { exact: true }).fill(CAIO.password);
    await dialog.getByLabel('Senha nova', { exact: true }).fill(NEW_CAIO_PASSWORD);
    await dialog.getByLabel('Repita a senha nova', { exact: true }).fill(NEW_CAIO_PASSWORD);
    await dialog.getByRole('button', { name: 'Trocar senha' }).click();
    await expect(
      here.getByText('Senha trocada. Os outros aparelhos saíram da conta.'),
    ).toBeVisible();
    changed = true;

    await other.reload();
    await expect(other).toHaveURL(/\/login/);
    await here.reload();
    await expect(here.getByRole('heading', { name: 'Minha conta', level: 1 })).toBeVisible();

    await submitLogin(other, CAIO);
    await expect(other.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
    await signInThroughTheForm(other, { ...CAIO, password: NEW_CAIO_PASSWORD });
  } finally {
    if (changed) {
      const restored = await here.request.post('/api/account/password', {
        data: { currentPassword: NEW_CAIO_PASSWORD, newPassword: CAIO.password },
      });
      expect(restored.status()).toBe(204);
    }
  }
});

test('with 2FA on, the login asks for the app code, and a recovery code also gets in', async ({
  newPlayerPage,
}) => {
  // Waits up to one TOTP period: the code that enabled 2FA cannot sign in again (replay).
  test.setTimeout(150_000);
  const bia = await newPlayerPage();
  await signInThroughTheForm(bia, BIA);
  let recoveryCodes: string[] = [];
  try {
    await openAccount(bia);
    await bia.getByRole('button', { name: 'Ligar 2FA' }).click();
    const setup = bia.getByRole('dialog', { name: 'Ligar 2FA' });
    await setup.getByLabel('Senha atual', { exact: true }).fill(BIA.password);
    await setup.getByRole('button', { name: 'Continuar' }).click();
    await expect(setup.getByRole('img', { name: 'QR code para o app autenticador' })).toBeVisible();
    const app = authenticatorOf(await setup.locator('code').innerText());
    // The code first: a step that turns in between only makes the wait below longer.
    const firstCode = app.generate();
    const enabledStep = currentTotpStep();
    await setup.getByLabel('Código do app', { exact: true }).fill(firstCode);
    await setup.getByRole('button', { name: 'Ligar 2FA' }).click();
    const codes = setup.getByRole('list', { name: 'Códigos de recuperação' }).getByRole('listitem');
    await expect(codes).toHaveCount(10);
    recoveryCodes = await codes.allInnerTexts();
    await setup.getByRole('button', { name: 'Guardei os códigos' }).click();
    await expect(bia.getByText('Ligado · 10 códigos de recuperação')).toBeVisible();

    await signOutByMenu(bia, 'Bia');
    await submitLogin(bia, BIA);
    const secondStep = bia.getByRole('form', { name: 'Verificação em duas etapas' });
    await expect(secondStep).toBeVisible();
    const appCode = await codeAfterStep(bia, app, enabledStep);
    await secondStep.getByLabel('Código do app autenticador').fill(appCode);
    await secondStep.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(shellOf(bia)).toBeVisible();

    await signOutByMenu(bia, 'Bia');
    await submitLogin(bia, BIA);
    await secondStep.getByRole('button', { name: 'Usar um código de recuperação' }).click();
    await secondStep.getByLabel('Código de recuperação').fill(recoveryCodeAt(recoveryCodes, 0));
    await secondStep.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(shellOf(bia)).toBeVisible();

    await openAccount(bia);
    await expect(bia.getByText('Ligado · 9 códigos de recuperação')).toBeVisible();
    await bia.getByRole('button', { name: 'Desligar', exact: true }).click();
    const off = bia.getByRole('dialog', { name: 'Desligar 2FA' });
    await off.getByLabel('Senha atual', { exact: true }).fill(BIA.password);
    await off.getByLabel('Código do app ou de recuperação').fill(recoveryCodeAt(recoveryCodes, 1));
    await off.getByRole('button', { name: 'Desligar', exact: true }).click();
    await expect(bia.getByText('2FA desligado.')).toBeVisible();
    recoveryCodes = [];
  } finally {
    // A red run must not leave Bia behind a second step for the specs after this one.
    if (recoveryCodes.length > 0) {
      await bia.request.post('/api/account/two-factor/disable', {
        data: { currentPassword: BIA.password, code: recoveryCodeAt(recoveryCodes, 9) },
      });
    }
  }
});
