import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { FeedbackAdminApiFake } from '../../support/feedback-api-fake';
import { DICE_SUGGESTION, FEEDBACK_SHOT, TOKEN_BUG } from '../../support/feedback-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';

describe('backoffice feedback queue (/admin/relatos)', () => {
  let deps: TestDependencies;
  let api: FeedbackAdminApiFake;

  beforeEach(() => {
    deps = testDependencies();
    api = new FeedbackAdminApiFake([TOKEN_BUG, DICE_SUGGESTION]);
    deps = { ...deps, feedbackAdminApi: api };
    deps.authApi.answerMeWith(ROOT_ADMIN);
  });

  async function open(): Promise<void> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/relatos'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: 'Relatos' });
  }

  function rowWith(text: string): HTMLElement {
    const row = screen.getByText(text).closest('tr');
    if (row === null) throw new Error(`no table row around "${text}"`);
    return row;
  }

  it('the side offers "Relatos" (current) between Denúncias and Comunicados', async () => {
    await open();

    const nav = screen.getByRole('navigation', { name: 'Backoffice' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels.indexOf('Relatos')).toBe(labels.indexOf('Denúncias') + 1);
    expect(within(nav).getByRole('link', { name: 'Relatos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await waitFor(() => expect(document.title).toBe('Lorkarium · Relatos'));
  });

  it('each entry shows its kind, first line, where, screenshots and the @', async () => {
    await open();

    const bug = rowWith('O token voltou');
    expect(within(bug).getByText('Bug')).toBeInTheDocument();
    expect(within(bug).getByText('Navegador · Chrome 142')).toBeInTheDocument();
    expect(within(bug).getByText('1 print')).toBeInTheDocument();
    expect(within(bug).getByText('@bia')).toBeInTheDocument();
    const suggestion = rowWith('Tecla D rola 1d20');
    expect(within(suggestion).getByText('Sugestão')).toBeInTheDocument();
    expect(within(suggestion).getByText('App para Windows · Lorkarium 0.3.1')).toBeInTheDocument();
  });

  it('with nothing waiting it says so', async () => {
    api.entries = [];
    await open();

    expect(screen.getByText('Nenhum relato esperando análise.')).toBeInTheDocument();
  });

  it('"Abrir" shows the sections and the screenshot through the admin route', async () => {
    await open();
    await userEvent.click(within(rowWith('O token voltou')).getByRole('button', { name: 'Abrir' }));

    const dialog = await screen.findByRole('dialog', { name: 'Bug de @bia' });
    expect(within(dialog).getByText('O token andar')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Print 1' })).toHaveAttribute(
      'src',
      `/api/admin/feedback/${TOKEN_BUG.id}/attachments/${FEEDBACK_SHOT.id}`,
    );
  });

  it('"Publicar no GitHub" opens the draft, sends the edited text and the entry leaves with a link to the issue', async () => {
    await open();
    await userEvent.click(
      within(rowWith('O token voltou')).getByRole('button', { name: 'Publicar no GitHub' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Publicar no GitHub' });
    expect(dialog).toHaveTextContent('Isto vai para um repositório público.');
    const title = within(dialog).getByLabelText('Título da issue');
    expect(title).toHaveValue('[bug] O token voltou');
    expect(within(dialog).getByLabelText('Texto da issue (Markdown)')).toHaveValue(
      TOKEN_BUG.draft.body,
    );
    await userEvent.clear(title);
    // `[[` types a literal `[` (user-event reads `[…]` as a key name).
    await userEvent.type(title, '[[bug] Token volta ao soltar');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar no GitHub' }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Issue #42 aberta.');
    expect(within(notice).getByRole('link', { name: 'Ver no GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/ByelBardini/lorkarium/issues/42',
    );
    expect(screen.queryByText('O token voltou')).not.toBeInTheDocument();
    expect(api.published).toEqual([
      {
        entryId: TOKEN_BUG.id,
        request: { title: '[bug] Token volta ao soltar', body: TOKEN_BUG.draft.body },
      },
    ]);
  });

  it.each([
    [{ kind: 'issue_tracker_unavailable' }, 'O GitHub não respondeu. O relato continua na fila.'],
    [
      { kind: 'issue_tracker_not_configured' },
      'A integração com o GitHub não está configurada no server.',
    ],
    [{ kind: 'not_found' }, 'Esse relato já foi fechado.'],
  ] as const)('a publish refused as %o says it in the open dialog', async (failure, text) => {
    api.answers.publish = failure;
    await open();
    await userEvent.click(
      within(rowWith('O token voltou')).getByRole('button', { name: 'Publicar no GitHub' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Publicar no GitHub' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar no GitHub' }));

    expect(await within(dialog).findByText(text)).toBeInTheDocument();
  });

  it('an empty title keeps the publish button off', async () => {
    await open();
    await userEvent.click(
      within(rowWith('O token voltou')).getByRole('button', { name: 'Publicar no GitHub' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Publicar no GitHub' });

    await userEvent.clear(within(dialog).getByLabelText('Título da issue'));

    expect(within(dialog).getByRole('button', { name: 'Publicar no GitHub' })).toBeDisabled();
  });

  it('"Arquivar" asks first, then the entry leaves and nothing is published', async () => {
    await open();
    await userEvent.click(
      within(rowWith('Tecla D rola 1d20')).getByRole('button', { name: 'Arquivar' }),
    );
    const confirm = await screen.findByRole('alertdialog', { name: 'Arquivar o relato de @caio?' });
    expect(confirm).toHaveTextContent(
      'O relato e os prints somem para sempre e ninguém é avisado.',
    );

    await userEvent.click(within(confirm).getByRole('button', { name: 'Arquivar' }));

    await waitFor(() => expect(screen.queryByText('Tecla D rola 1d20')).not.toBeInTheDocument());
    expect(api.archived).toEqual([DICE_SUGGESTION.id]);
    expect(api.published).toEqual([]);
  });
});
