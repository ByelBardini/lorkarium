import { SANCTION_RULES } from '@lorkarium/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { LYRA_CARD } from '../../support/profile-card-fixtures';
import {
  CHEATING_REPORT,
  HARASSMENT_REPORT,
  SPAM_REPORT,
} from '../../support/user-reports-fixtures';

describe('backoffice reports queue (/admin/reports)', () => {
  let deps: TestDependencies;
  const LYRA = `@${LYRA_CARD.username}`;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
  });

  async function open(): Promise<void> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/reports'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: 'Denúncias' });
  }

  function rowWith(text: string): HTMLElement {
    const row = screen.getByText(text).closest('tr');
    if (row === null) throw new Error(`no table row around "${text}"`);
    return row;
  }

  it('the side offers "Denúncias" (current) and the page is titled', async () => {
    await open();
    const nav = screen.getByRole('navigation', { name: 'Backoffice' });
    expect(within(nav).getByRole('link', { name: 'Denúncias' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await waitFor(() => expect(document.title).toBe('Lorkarium · Denúncias'));
  });

  it('each open report shows its reason, its text and both @', async () => {
    deps.userReportsApi.put(SPAM_REPORT, HARASSMENT_REPORT);
    await open();
    const table = screen.getByRole('table', { name: 'Denúncias abertas' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    const spam = rowWith('Spam');
    expect(within(spam).getByText('Manda link de loja no chat da mesa.')).toBeInTheDocument();
    expect(within(spam).getByText('@biaflor')).toBeInTheDocument();
    expect(within(spam).getByRole('button', { name: LYRA })).toBeInTheDocument();
    expect(within(rowWith('Assédio')).getByText('Sem texto')).toBeInTheDocument();
    expect(deps.userReportsApi.answers.callsOf('list')).toEqual([{ status: 'open', page: 1 }]);
  });

  it('"Resolver" asks for the note, closes the report with it and it leaves the list', async () => {
    deps.userReportsApi.put(SPAM_REPORT, HARASSMENT_REPORT);
    await open();
    await userEvent.click(within(rowWith('Assédio')).getByRole('button', { name: 'Resolver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolver a denúncia' });
    await userEvent.type(within(dialog).getByLabelText(/Nota/), 'Aviso aplicado.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolver' }));
    await waitFor(() => expect(screen.queryByText('Assédio')).not.toBeInTheDocument());
    expect(screen.getByText('Spam')).toBeInTheDocument();
    expect(deps.userReportsApi.answers.callsOf('resolve')).toEqual([
      { reportId: HARASSMENT_REPORT.id, status: 'resolved', note: 'Aviso aplicado.' },
    ]);
  });

  it('"Arquivar" closes the report as dismissed in one click', async () => {
    deps.userReportsApi.put(SPAM_REPORT, HARASSMENT_REPORT);
    await open();
    await userEvent.click(within(rowWith('Assédio')).getByRole('button', { name: 'Arquivar' }));
    await waitFor(() => expect(screen.queryByText('Assédio')).not.toBeInTheDocument());
    expect(deps.userReportsApi.answers.callsOf('resolve')).toEqual([
      { reportId: HARASSMENT_REPORT.id, status: 'dismissed' },
    ]);
  });

  it('a row says "(excluído)" for a deleted account, names the table and counts the screenshots', async () => {
    deps.userReportsApi.put(CHEATING_REPORT, SPAM_REPORT);
    await open();
    const cheating = rowWith('Trapaça');
    expect(within(cheating).getByText('@ana (excluído)')).toBeInTheDocument();
    expect(within(cheating).getByText('@caio (excluído)')).toBeInTheDocument();
    expect(within(cheating).getByText('Os Sinos de Vharn')).toBeInTheDocument();
    expect(within(cheating).getByText('3 prints')).toBeInTheDocument();
    expect(within(rowWith('Spam')).getByText('Sem prints')).toBeInTheDocument();
  });

  it('opening a report shows each screenshot from the admin route, linked to its full size', async () => {
    deps.userReportsApi.put(CHEATING_REPORT);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Denúncia de @ana (excluído)' });
    const [first] = CHEATING_REPORT.attachments;
    const url = `/api/admin/reports/${CHEATING_REPORT.id}/attachments/${first!.id}`;
    expect(within(dialog).getByRole('img', { name: 'Print 1' })).toHaveAttribute('src', url);
    const full = within(dialog).getByRole('link', { name: 'Abrir o print 1 em tamanho real' });
    expect(full).toHaveAttribute('href', url);
    expect(full).toHaveAttribute('target', '_blank');
    expect(within(dialog).getAllByRole('img')).toHaveLength(3);
    expect(within(dialog).getByText('Mexeu nos dados pelo console.')).toBeInTheDocument();
  });

  it('"Aplicar medida" opens the measure dialog of the reported account tied to the report', async () => {
    deps.userReportsApi.put(HARASSMENT_REPORT);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar medida' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aplicar medida a @biaflor' });
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Regra da Política de uso'),
      SANCTION_RULES[0],
    );
    await userEvent.type(within(dialog).getByLabelText(/Motivo/), 'Insultos no chat da mesa.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar medida' }));
    await waitFor(() => expect(deps.sanctionsApi.answers.callsOf('issue')).toHaveLength(1));
    expect(deps.sanctionsApi.answers.callsOf('issue')).toEqual([
      {
        userId: HARASSMENT_REPORT.target.id,
        body: expect.objectContaining({ kind: 'warning', reportId: HARASSMENT_REPORT.id }),
      },
    ]);
  });

  it('a report on a deleted account offers no measure', async () => {
    deps.userReportsApi.put(CHEATING_REPORT);
    await open();
    expect(screen.queryByRole('button', { name: 'Aplicar medida' })).not.toBeInTheDocument();
  });

  it('an empty queue says there is nothing to review, without a table', async () => {
    await open();
    expect(screen.getByText('Nenhuma denúncia aberta.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it("the reported person's @ opens their profile card", async () => {
    deps.userReportsApi.put(SPAM_REPORT);
    await open();
    await userEvent.click(screen.getByRole('button', { name: LYRA }));
    expect(await screen.findByRole('dialog', { name: `Perfil de ${LYRA}` })).toBeInTheDocument();
    await waitFor(() =>
      expect(deps.profileCardApi.answers.callsOf('card')).toContain(LYRA_CARD.id),
    );
  });

  it('a refused resolve says so and the report stays', async () => {
    deps.userReportsApi.put(SPAM_REPORT);
    deps.userReportsApi.answers.answer('resolve', { ok: false, failure: { kind: 'not_found' } });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Essa denúncia já foi fechada.');
    expect(screen.getByText('Spam')).toBeInTheDocument();
  });
});
