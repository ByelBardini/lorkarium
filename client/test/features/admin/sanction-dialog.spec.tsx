import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { bia } from '../../support/user-admin-api-fake';

const STATEMENT = 'Ameaçou um jogador real no chat da mesa Vharn.';

describe('applying a measure to an account', () => {
  let deps: TestDependencies;
  const biaId = bia(new Date()).id;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/users'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('table', { name: 'Usuários' });
  });

  async function openForBia(): Promise<HTMLElement> {
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Bia' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Aplicar medida…' }));
    return screen.findByRole('dialog', { name: 'Aplicar medida a @biaflor' });
  }

  async function fill(dialog: HTMLElement, kind: string, rule: string): Promise<void> {
    await userEvent.click(within(dialog).getByRole('radio', { name: kind }));
    await userEvent.selectOptions(within(dialog).getByLabelText('Regra da Política de uso'), rule);
    await userEvent.type(
      within(dialog).getByLabelText('Motivo (a pessoa lê este texto)'),
      STATEMENT,
    );
  }

  it('a suspension until a date shows the e-mail preview, then POSTs the measure and the row says SUSPENSO', async () => {
    const dialog = await openForBia();
    await fill(dialog, 'Suspensão', '§2 Respeito às pessoas');
    fireEvent.change(within(dialog).getByLabelText('Até (vazio = sem prazo)'), {
      target: { value: '2026-10-21T18:00' },
    });

    const preview = within(dialog).getByRole('region', { name: 'Prévia do e-mail' });
    expect(preview).toHaveTextContent('Medida: Suspensão temporária');
    expect(preview).toHaveTextContent('Regra: Respeito às pessoas (§2 da Política de uso)');
    expect(preview).toHaveTextContent('Prazo: até 21/10/2026 às 18:00');
    expect(preview).toHaveTextContent(`O motivo: ${STATEMENT}`);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar medida' }));

    expect(await screen.findByText('O acesso de @biaflor foi suspenso.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(deps.sanctionsApi.answers.callsOf('issue')).toEqual([
      {
        userId: biaId,
        body: {
          kind: 'suspension',
          rule: 'harassment',
          statement: STATEMENT,
          until: new Date('2026-10-21T18:00').toISOString(),
        },
      },
    ]);
    const row = screen.getByText('@biaflor').closest('tr');
    expect(row).toHaveTextContent('Suspenso');
  });

  it('a warning (the first choice) has no end field and its notice says so', async () => {
    const dialog = await openForBia();
    expect(within(dialog).getByRole('radio', { name: 'Aviso' })).toBeChecked();
    expect(within(dialog).queryByLabelText('Até (vazio = sem prazo)')).toBeNull();

    await fill(dialog, 'Aviso', '§9 Spam e divulgação');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar medida' }));

    expect(await screen.findByText('@biaflor recebeu um aviso.')).toBeInTheDocument();
    expect(deps.sanctionsApi.answers.callsOf('issue')).toEqual([
      { userId: biaId, body: { kind: 'warning', rule: 'spam', statement: STATEMENT } },
    ]);
  });

  it('a suspension with the end left empty has no deadline', async () => {
    const dialog = await openForBia();
    await fill(dialog, 'Suspensão', '§2 Respeito às pessoas');

    expect(within(dialog).getByRole('region', { name: 'Prévia do e-mail' })).toHaveTextContent(
      'Prazo: sem prazo',
    );
  });

  it('"Exclusão da conta" goes on to the deletion dialog, which schedules the ban instead of a plain delete', async () => {
    const dialog = await openForBia();
    await fill(dialog, 'Exclusão da conta', '§2 Respeito às pessoas');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Continuar para a exclusão' }),
    );

    const deletion = await screen.findByRole('alertdialog', { name: 'Excluir @biaflor?' });
    expect(deletion).toHaveTextContent('A exclusão é uma medida por violar a Política de uso');
    expect(deletion).toHaveTextContent('excluída em 15 dias, se a pessoa não contestar');
    await userEvent.type(
      await within(deletion).findByLabelText('Digite @biaflor para confirmar'),
      '@biaflor',
    );
    await userEvent.click(
      within(deletion).getByRole('button', { name: 'Suspender e agendar a exclusão' }),
    );

    expect(
      await screen.findByText(
        /^O acesso de @biaflor foi suspenso e a conta será excluída em \d\d\/\d\d\/\d{4}\.$/,
      ),
    ).toBeInTheDocument();
    expect(deps.sanctionsApi.answers.callsOf('issue')).toEqual([
      { userId: biaId, body: { kind: 'ban', rule: 'harassment', statement: STATEMENT } },
    ]);
    expect(deps.userAdminApi.answers.callsOf('deleteUser')).toEqual([]);
  });

  it('ALREADY_SUSPENDED shows on the measure field and the dialog stays open', async () => {
    deps.sanctionsApi.answers.answer('issue', {
      ok: false,
      failure: { kind: 'already_suspended' },
    });
    const dialog = await openForBia();
    await fill(dialog, 'Suspensão', '§2 Respeito às pessoas');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar medida' }));

    expect(await within(dialog).findByText('A conta já está suspensa.')).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Aplicar medida a @biaflor' })).toBeInTheDocument();
  });

  it('without a rule or a statement nothing is sent and the field says what is missing', async () => {
    const dialog = await openForBia();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar medida' }));

    expect(within(dialog).getByText('Escolha a regra que a conta violou.')).toBeVisible();
    expect(within(dialog).getByText('Escreva o motivo que a pessoa vai ler.')).toBeVisible();
    expect(deps.sanctionsApi.answers.callsOf('issue')).toEqual([]);
  });
});
