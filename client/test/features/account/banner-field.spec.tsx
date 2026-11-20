import { PLAN_LIMITS } from '@lorkarium/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { BannerField } from '@/features/account/banner-field';
import { AccountPlanContext } from '@/features/plans/use-plan-limits';
import type { AccountLimits } from '@/stores/session-store';
import { createSessionStore } from '@/stores/session-store';
import { ANA } from '../../support/auth-api-fake';
import { CENTER_STRIP, fakeCropAreaReporting } from '../../support/crop-area-fake';
import { ANA_PROFILE, ProfileApiFake, UPLOADED_BANNER_ID } from '../../support/profile-api-fake';

const PAID: AccountLimits = { plan: 'lenda', limits: PLAN_LIMITS.lenda, customization: true };
const APOIADOR: AccountLimits = {
  plan: 'apoiador',
  limits: PLAN_LIMITS.apoiador,
  customization: true,
};
const NARRADOR: AccountLimits = {
  plan: 'narrador',
  limits: PLAN_LIMITS.narrador,
  customization: true,
};
const FREE: AccountLimits = { plan: 'free', limits: PLAN_LIMITS.free, customization: false };

describe('BannerField', () => {
  let profileApi: ProfileApiFake;

  beforeEach(() => {
    profileApi = new ProfileApiFake();
  });

  function renderField(account: AccountLimits, profile = ANA_PROFILE): void {
    const sessionStore = createSessionStore();
    sessionStore.getState().signedIn(ANA);
    const element = (
      <AccountPlanContext value={account}>
        <BannerField
          profile={profile}
          profileApi={profileApi}
          sessionStore={sessionStore}
          cropArea={fakeCropAreaReporting(CENTER_STRIP)}
        />
      </AccountPlanContext>
    );
    const router = createMemoryRouter([{ path: '/', element }]);
    render(<RouterProvider router={router} />);
  }

  const field = (): HTMLElement => screen.getByRole('group', { name: 'Banner' });

  function png(): File {
    return new File([new Uint8Array(4)], 'mapa.png', { type: 'image/png' });
  }

  it.each([
    ['Grátis', FREE],
    ['Apoiador', APOIADOR],
    ['Narrador', NARRADOR],
  ] as const)(
    'on %s the banner is locked: the Lenda seal, the plan sentence and no way to send',
    (_, account) => {
      renderField(account);

      expect(within(field()).getByRole('img', { name: 'Plano Lenda' })).toBeVisible();
      expect(within(field()).getByText('Banner de perfil está no plano Lenda.')).toBeVisible();
      expect(within(field()).getByText('Disponível no plano Lenda')).toBeVisible();
      expect(within(field()).queryByLabelText('Arquivo de imagem')).toBeNull();
      expect(within(field()).queryByRole('button', { name: /imagem/ })).toBeNull();
    },
  );

  // The server cuts every frame: a GIF keeps moving, so the browser never redraws the file.
  it('on a paid plan a file opens the 3:1 crop, and "Enviar" sends the file itself with the rectangle', async () => {
    renderField(PAID);
    const file = png();

    await userEvent.upload(within(field()).getByLabelText('Arquivo de imagem'), file);
    const dialog = await screen.findByRole('dialog', { name: 'Recortar o banner do perfil' });
    expect(within(dialog).getByLabelText('Área de recorte')).toHaveAttribute('data-aspect', '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Recorte de teste' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));

    await waitFor(() => expect(profileApi.answers.callsOf('uploadBanner')).toHaveLength(1));
    expect(profileApi.answers.callsOf('uploadBanner')).toEqual([{ file, crop: CENTER_STRIP }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Cancelar" in the crop sends nothing', async () => {
    renderField(PAID);

    await userEvent.upload(within(field()).getByLabelText('Arquivo de imagem'), png());
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(profileApi.answers.callsOf('uploadBanner')).toEqual([]);
  });

  it('the banner kept is shown from GET /api/banners/:id, with "Tirar banner"', () => {
    renderField(PAID, { ...ANA_PROFILE, bannerId: UPLOADED_BANNER_ID });

    expect(within(field()).getByTestId('banner-field-image')).toHaveAttribute(
      'src',
      `/api/banners/${UPLOADED_BANNER_ID}`,
    );
    expect(within(field()).getByRole('button', { name: 'Tirar banner' })).toBeVisible();
  });

  it('a refusal of the plan from the server (the Lenda ended meanwhile) reads the plan sentence', async () => {
    profileApi.answers.answer('uploadBanner', {
      ok: false,
      failure: {
        kind: 'plan_limit',
        planLimit: { resource: 'profileBanner', limit: 0, plan: 'narrador' },
      },
    });
    renderField(PAID);

    await userEvent.upload(within(field()).getByLabelText('Arquivo de imagem'), png());
    await userEvent.click(await screen.findByRole('button', { name: 'Recorte de teste' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await within(field()).findByText('Banner de perfil está no plano Lenda.')).toBeVisible();
  });
});
