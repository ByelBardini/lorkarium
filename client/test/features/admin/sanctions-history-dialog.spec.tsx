import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, TEST_NOW, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { biaWarning } from '../../support/sanctions-api-fake';
import { bia, pedroSuspended } from '../../support/user-admin-api-fake';

describe('the measures of an account', () => {
  let deps: TestDependencies;
  const warningId = biaWarning(TEST_NOW).id;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/users'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('table', { name: 'Usuários' });
  });

  async function openFor(person: string, handle: string): Promise<HTMLElement> {
    await userEvent.click(screen.getByRole('button', { name: `Ações de ${person}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Medidas…' }));
    return screen.findByRole('dialog', { name: `Medidas de ${handle}` });
  }

  it('lists each measure with its kind, rule, date, who applied it and the appeal state', async () => {
    const dialog = await openFor('Bia', '@biaflor');

    const item = await within(dialog).findByRole('listitem');
    expect(item).toHaveTextContent('Aviso');
    expect(item).toHaveTextContent('Spam e divulgação (§9)');
    expect(item).toHaveTextContent('12/10/2026 por @lucas');
    expect(item).toHaveTextContent('Mandou propaganda a quem não é amigo.');
    expect(item).toHaveTextContent('Sem contestação');
    expect(deps.sanctionsApi.answers.callsOf('history')).toEqual([bia(TEST_NOW).id]);
  });

  it('a ban shows the date of its deletion, and "cancelada" once reverted', async () => {
    const ban = {
      ...biaWarning(TEST_NOW),
      kind: 'ban',
      rule: 'harassment',
      deletionDueAt: new Date(2026, 11, 5, 12).toISOString(),
    } as const;
    deps.sanctionsApi.measures.set(bia(TEST_NOW).id, [ban]);
    const dialog = await openFor('Bia', '@biaflor');

    const item = await within(dialog).findByRole('listitem');
    expect(item).toHaveTextContent('Exclusão da conta · Respeito às pessoas (§2)');
    expect(item).toHaveTextContent('Exclusão em 05/12/2026');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar contestação' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Revertida' }));
    await userEvent.type(within(dialog).getByLabelText('Nota da revisão'), 'Era outra pessoa.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar contestação' }));

    expect(await within(dialog).findByText(/Exclusão cancelada/)).toBeVisible();
  });

  it('an account without measures says so', async () => {
    const dialog = await openFor('Pedro', '@pedrinho');

    expect(await within(dialog).findByText('Nenhuma medida até agora.')).toBeVisible();
    expect(deps.sanctionsApi.answers.callsOf('history')).toEqual([pedroSuspended(TEST_NOW).id]);
  });

  it('"Registrar contestação" with "Revertida" and a note saves the decision and shows it', async () => {
    const dialog = await openFor('Bia', '@biaflor');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Registrar contestação' }),
    );
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Revertida' }));
    await userEvent.type(within(dialog).getByLabelText('Nota da revisão'), 'Era outra pessoa.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar contestação' }));

    expect(await within(dialog).findByText(/Contestação revertida/)).toBeVisible();
    expect(within(dialog).getByRole('listitem')).toHaveTextContent('Era outra pessoa.');
    expect(deps.sanctionsApi.answers.callsOf('recordAppeal')).toEqual([
      { sanctionId: warningId, body: { outcome: 'reverted', note: 'Era outra pessoa.' } },
    ]);
  });

  it('"Chegou" records only the arrival, without a note', async () => {
    const dialog = await openFor('Bia', '@biaflor');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Registrar contestação' }),
    );
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Chegou (ainda sem decisão)' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar contestação' }));

    expect(await within(dialog).findByText(/Contestação recebida em/)).toBeVisible();
    expect(deps.sanctionsApi.answers.callsOf('recordAppeal')).toEqual([
      { sanctionId: warningId, body: { outcome: 'received' } },
    ]);
  });

  it('a decision without the note is not sent and the field asks for it', async () => {
    const dialog = await openFor('Bia', '@biaflor');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Registrar contestação' }),
    );
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Mantida' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar contestação' }));

    expect(within(dialog).getByText('Escreva a nota da revisão.')).toBeVisible();
    expect(deps.sanctionsApi.answers.callsOf('recordAppeal')).toEqual([]);
  });

  it('APPEAL_ALREADY_DECIDED shows the refusal in the dialog', async () => {
    deps.sanctionsApi.answers.answer('recordAppeal', {
      ok: false,
      failure: { kind: 'appeal_already_decided' },
    });
    const dialog = await openFor('Bia', '@biaflor');
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Registrar contestação' }),
    );
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Chegou (ainda sem decisão)' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar contestação' }));

    expect(await within(dialog).findByText('Essa contestação já foi decidida.')).toBeVisible();
  });
});
