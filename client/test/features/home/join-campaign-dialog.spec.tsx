import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, QUELM } from '../../support/campaigns-api-fake';

describe('JoinCampaignDialog', () => {
  let deps: TestDependencies;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  async function openDialog(): Promise<HTMLElement> {
    router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com código' }));
    return screen.findByRole('dialog', { name: 'Entrar numa mesa' });
  }

  async function sendCode(dialog: HTMLElement, code: string): Promise<void> {
    if (code) await userEvent.type(within(dialog).getByLabelText('Código da mesa'), code);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }));
  }

  it('an empty code is refused with "Informe o código da mesa."', async () => {
    const dialog = await openDialog();
    await sendCode(dialog, '');
    expect(within(dialog).getByText('Informe o código da mesa.')).toBeInTheDocument();
    expect(deps.campaignsApi.callsOf('join')).toEqual([]);
  });

  it('a short code is refused with the shape of a valid one', async () => {
    const dialog = await openDialog();
    await sendCode(dialog, 'abc');
    const code = within(dialog).getByLabelText('Código da mesa');
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(code).toHaveAccessibleDescription('O código tem 8 letras e números, como VHRN-7K2Q.');
  });

  it('typing the code shows it masked as XXXX-XXXX', async () => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText('Código da mesa'), 'vhrn7k2q99');
    expect(within(dialog).getByLabelText('Código da mesa')).toHaveValue('VHRN-7K2Q');
  });

  it('a lowercase hyphenated code is accepted and sent in canonical form', async () => {
    const dialog = await openDialog();
    await sendCode(dialog, 'vhrn-7k2q');
    await waitFor(() => expect(deps.campaignsApi.callsOf('join')).toEqual([{ code: 'VHRN7K2Q' }]));
  });

  it('an unknown code is reported on the code field', async () => {
    deps.campaignsApi.answer('join', { ok: false, failure: { kind: 'not_found' } });
    const dialog = await openDialog();
    await sendCode(dialog, 'ZZZZ2345');
    const code = within(dialog).getByLabelText('Código da mesa');
    expect(await within(dialog).findByText('Nenhuma mesa com esse código.')).toBeInTheDocument();
    expect(code).toHaveAccessibleDescription('Nenhuma mesa com esse código.');
  });

  it('a campaign that asks for a password shows the field focused, keeping the code', async () => {
    deps.campaignsApi.answer('join', { ok: false, failure: { kind: 'password_required' } });
    const dialog = await openDialog();
    await sendCode(dialog, 'VHRN7K2Q');
    const password = await within(dialog).findByLabelText('Senha da mesa');
    expect(password).toHaveFocus();
    expect(within(dialog).getByText('Essa mesa pede senha.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Código da mesa')).toHaveValue('VHRN-7K2Q');
  });

  it('a wrong password reads "Senha incorreta." and clears the password', async () => {
    deps.campaignsApi.answer('join', { ok: false, failure: { kind: 'password_required' } });
    const dialog = await openDialog();
    await sendCode(dialog, 'VHRN7K2Q');
    deps.campaignsApi.answer('join', { ok: false, failure: { kind: 'password_invalid' } });
    await userEvent.type(await within(dialog).findByLabelText('Senha da mesa'), 'errada');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entrar' }));
    expect(await within(dialog).findByText('Senha incorreta.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Senha da mesa')).toHaveValue('');
    expect(deps.campaignsApi.callsOf('join').at(-1)).toEqual({
      code: 'VHRN7K2Q',
      password: 'errada',
    });
  });

  it('too many attempts say how long to wait', async () => {
    deps.campaignsApi.answer('join', {
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 30 },
    });
    const dialog = await openDialog();
    await sendCode(dialog, 'VHRN7K2Q');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Tente de novo em 30 s.',
    );
  });

  it('success closes the dialog and opens the detail of the campaign joined', async () => {
    deps.campaignsApi.answer('detail', { ok: true, value: detailOf(QUELM) });
    const dialog = await openDialog();
    await sendCode(dialog, 'VHRN7K2Q');
    await screen.findByRole('dialog', { name: QUELM.name });
    expect(dialog).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/campaigns/${QUELM.id}`);
  });
});
