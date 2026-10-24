import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { bia } from '../../support/user-admin-api-fake';

const VHARN = { id: '0f0e0d0c-0b0a-4909-8807-060504030201', name: 'Vharn', otherMembers: 3 };

describe('actions of each account', () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/users'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('table', { name: 'Usuários' });
  });

  async function choose(person: string, item: string): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: `Ações de ${person}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: item }));
  }

  function rowOf(handle: string): HTMLElement {
    const row = screen.getByText(handle).closest('tr');
    if (!row) throw new Error(`no row for ${handle}`);
    return row;
  }

  it('"Mandar link de nova senha" shows the link, "Copiar link" and "Vale 1 hora."', async () => {
    await choose('Bia', 'Mandar link de nova senha');
    const dialog = await screen.findByRole('dialog', { name: 'Link de nova senha para @biaflor' });
    expect(await within(dialog).findByRole('textbox', { name: 'Link de nova senha' })).toHaveValue(
      'https://mesa.example.com/reset-password#token=tok-1',
    );
    expect(within(dialog).getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
    expect(within(dialog).getByText('Vale 1 hora.')).toBeInTheDocument();
    expect(deps.userAdminApi.answers.callsOf('sendPasswordLink')).toEqual([bia(new Date()).id]);
  });

  it('"Tornar admin" asks with the consequence, then the row says ADMIN', async () => {
    await choose('Bia', 'Tornar admin');
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Dar acesso de admin a @biaflor?',
    });
    expect(dialog).toHaveTextContent('A pessoa poderá convidar, suspender e excluir contas.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tornar admin' }));
    expect(await screen.findByText('@biaflor agora é admin.')).toHaveAttribute('role', 'status');
    expect(rowOf('@biaflor')).toHaveTextContent('Admin');
  });

  it('"Tirar acesso de admin" goes straight, without a dialog', async () => {
    await choose('Bia', 'Tornar admin');
    const grant = await screen.findByRole('alertdialog', {
      name: 'Dar acesso de admin a @biaflor?',
    });
    await userEvent.click(within(grant).getByRole('button', { name: 'Tornar admin' }));
    await screen.findByText('@biaflor agora é admin.');
    await choose('Bia', 'Tirar acesso de admin');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText('@biaflor não é mais admin.')).toBeInTheDocument();
    expect(rowOf('@biaflor')).toHaveTextContent('Usuário');
  });

  it('"Suspender acesso" confirms, then SUSPENSO and the menu offers "Reativar acesso" only', async () => {
    await choose('Bia', 'Suspender acesso');
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Suspender o acesso de @biaflor?',
    });
    expect(dialog).toHaveTextContent('@biaflor sai de todas as sessões agora');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));
    expect(await screen.findByText('O acesso de @biaflor foi suspenso.')).toBeInTheDocument();
    expect(rowOf('@biaflor')).toHaveTextContent('Suspenso');
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Bia' }));
    expect(screen.getByRole('menuitem', { name: 'Reativar acesso' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Mandar link de nova senha' })).toBeNull();
  });

  it('"Reativar acesso" goes straight', async () => {
    await choose('Pedro', 'Reativar acesso');
    expect(await screen.findByText('O acesso de @pedrinho voltou.')).toBeInTheDocument();
    expect(rowOf('@pedrinho')).toHaveTextContent('Ativo');
  });

  describe('Excluir usuário', () => {
    it('blocked: names the tables and offers to suspend instead, without "Excluir"', async () => {
      deps.userAdminApi.answers.answer('deletionCheck', {
        ok: true,
        value: { blockingCampaigns: [VHARN], soloCampaigns: 0 },
      });
      await choose('Bia', 'Excluir usuário');
      const dialog = await screen.findByRole('alertdialog', { name: 'Excluir @biaflor?' });
      expect(
        await within(dialog).findByText('@biaflor criou mesas em que outras pessoas jogam:'),
      ).toBeInTheDocument();
      expect(within(dialog).getByText('Vharn (3 outras pessoas)')).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Excluir' })).toBeNull();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Suspender em vez disso' }));
      expect(
        await screen.findByRole('alertdialog', { name: 'Suspender o acesso de @biaflor?' }),
      ).toBeInTheDocument();
    });

    it('free: says what goes, unlocks "Excluir" by the @ and the row leaves', async () => {
      await choose('Bia', 'Excluir usuário');
      const dialog = await screen.findByRole('alertdialog', { name: 'Excluir @biaflor?' });
      expect(
        await within(dialog).findByText(
          'A conta de @biaflor e as 2 mesas só dela somem para sempre.',
        ),
      ).toBeInTheDocument();
      const remove = within(dialog).getByRole('button', { name: 'Excluir' });
      expect(remove).toBeDisabled();
      await userEvent.type(
        within(dialog).getByLabelText('Digite @biaflor para confirmar'),
        '@biaflor',
      );
      expect(remove).toBeEnabled();
      await userEvent.click(remove);
      expect(await screen.findByText('A conta @biaflor foi excluída.')).toBeInTheDocument();
      expect(screen.queryByText('@biaflor')).toBeNull();
    });

    it('someone joined meanwhile: the refusal turns the dialog into the blocked view', async () => {
      deps.userAdminApi.answers.answer('deleteUser', {
        ok: false,
        failure: { kind: 'owns_shared_campaigns', blockingCampaigns: [VHARN] },
      });
      await choose('Bia', 'Excluir usuário');
      const dialog = await screen.findByRole('alertdialog', { name: 'Excluir @biaflor?' });
      await userEvent.type(
        await within(dialog).findByLabelText('Digite @biaflor para confirmar'),
        '@biaflor',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
      expect(await within(dialog).findByText('Vharn (3 outras pessoas)')).toBeInTheDocument();
      expect(rowOf('@biaflor')).toBeInTheDocument();
    });

    it.each([
      [{ kind: 'self_action' }, 'Você não pode fazer isso com a sua própria conta.'],
      [
        { kind: 'rate_limited', retryAfterSeconds: 12 },
        'Muitas tentativas. Tente de novo em 12 s.',
      ],
      [{ kind: 'offline' }, 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
    ] as const)('%o shows "%s" in the dialog and the row stays', async (failure, message) => {
      deps.userAdminApi.answers.answer('deleteUser', { ok: false, failure });
      await choose('Bia', 'Excluir usuário');
      const dialog = await screen.findByRole('alertdialog', { name: 'Excluir @biaflor?' });
      await userEvent.type(
        await within(dialog).findByLabelText('Digite @biaflor para confirmar'),
        '@biaflor',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
      await waitFor(() => expect(rowOf('@biaflor')).toBeInTheDocument());
    });
  });
});
