import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { LYRA_CARD } from '../../support/profile-card-fixtures';
import { HARASSMENT_REPORT, SPAM_REPORT } from '../../support/user-reports-fixtures';

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

  it.each([
    ['Resolver', 'resolved'],
    ['Arquivar', 'dismissed'],
  ] as const)('"%s" closes the report as %s and it leaves the list', async (label, status) => {
    deps.userReportsApi.put(SPAM_REPORT, HARASSMENT_REPORT);
    await open();
    await userEvent.click(within(rowWith('Assédio')).getByRole('button', { name: label }));
    await waitFor(() => expect(screen.queryByText('Assédio')).not.toBeInTheDocument());
    expect(screen.getByText('Spam')).toBeInTheDocument();
    expect(deps.userReportsApi.answers.callsOf('resolve')).toEqual([
      { reportId: HARASSMENT_REPORT.id, status },
    ]);
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
    await userEvent.click(screen.getByRole('button', { name: 'Resolver' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Essa denúncia já foi fechada.');
    expect(screen.getByText('Spam')).toBeInTheDocument();
  });
});
