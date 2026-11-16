import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { FOUNDER_BADGE, NARRATOR_BADGE, VETERAN_BADGE } from '../../support/badges-admin-api-fake';

describe('backoffice badge catalog (/admin/badges)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
  });

  function renderAt(path: string): void {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
  }

  async function open(): Promise<void> {
    renderAt('/admin/badges');
    await screen.findByRole('heading', { name: 'Insígnias' });
  }

  // `hidden`: an open dialog hides the page from the accessibility tree, not from the DOM.
  function rowOf(name: string): HTMLElement {
    const table = screen.getByRole('table', { name: 'Insígnias', hidden: true });
    const row = within(table).getByText(name, { selector: 'td' }).closest('tr');
    if (!row) throw new Error(`no catalog row for "${name}"`);
    return row;
  }

  function namesInOrder(): string[] {
    const rows = within(screen.getByRole('table', { name: 'Insígnias' })).getAllByRole('row');
    return rows.slice(1).map((row) => row.querySelectorAll('td')[1]?.textContent ?? '');
  }

  async function choose(badge: string, item: string): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: `Ações de ${badge}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: item }));
  }

  it('"Insígnias" in the side leads from Usuários to the catalog, titled', async () => {
    renderAt('/admin/users');
    const nav = await screen.findByRole('navigation', { name: 'Backoffice' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Insígnias' }));
    expect(await screen.findByRole('heading', { name: 'Insígnias' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Insígnias' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await waitFor(() => expect(document.title).toBe('Lorkarium · Insígnias'));
  });

  it('each row shows image, name, description and how many accounts hold it, in order', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE, NARRATOR_BADGE);
    await open();
    expect(namesInOrder()).toEqual(['Veterano', 'Narrador']);
    const veteran = rowOf('Veterano');
    expect(within(veteran).getByRole('img', { name: 'Veterano' })).toHaveAttribute(
      'src',
      `/api/badge-images/${VETERAN_BADGE.imageId}`,
    );
    expect(veteran).toHaveTextContent('Jogou 100 sessões');
    expect(veteran).toHaveTextContent('12 contas');
    expect(rowOf('Narrador')).toHaveTextContent('1 conta');
  });

  it('the first row has no "Subir" and the last no "Descer"', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE, NARRATOR_BADGE, FOUNDER_BADGE);
    await open();
    expect(screen.queryByRole('button', { name: 'Subir Veterano' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descer Veterano' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir Fundador' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descer Fundador' })).not.toBeInTheDocument();
  });

  it('"Descer" sends the whole new order and the list follows it', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE, NARRATOR_BADGE, FOUNDER_BADGE);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Descer Veterano' }));
    await waitFor(() => expect(namesInOrder()).toEqual(['Narrador', 'Veterano', 'Fundador']));
    expect(deps.badgesAdminApi.answers.callsOf('reorder')).toEqual([
      [NARRATOR_BADGE.id, VETERAN_BADGE.id, FOUNDER_BADGE.id],
    ]);
  });

  it('"Subir" moves the badge one place up', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE, NARRATOR_BADGE, FOUNDER_BADGE);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Subir Fundador' }));
    await waitFor(() => expect(namesInOrder()).toEqual(['Veterano', 'Fundador', 'Narrador']));
  });

  it('a stale order says so and the list is read again', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE, NARRATOR_BADGE);
    deps.badgesAdminApi.answers.answer('reorder', {
      ok: false,
      failure: { kind: 'order_stale' },
    });
    await open();
    deps.badgesAdminApi.put(FOUNDER_BADGE);
    await userEvent.click(screen.getByRole('button', { name: 'Descer Veterano' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A lista de insígnias mudou no meio. Ela foi recarregada; ordene de novo.',
    );
    expect(namesInOrder()).toEqual(['Veterano', 'Narrador', 'Fundador']);
  });

  it('a badge without image says "Sem imagem" with the "Enviar imagem" shortcut', async () => {
    deps.badgesAdminApi.put(FOUNDER_BADGE);
    await open();
    const founder = rowOf('Fundador');
    expect(founder).toHaveTextContent('Sem imagem');
    expect(within(founder).getByRole('button', { name: 'Enviar imagem' })).toBeInTheDocument();
    expect(within(founder).queryByRole('img')).not.toBeInTheDocument();
  });

  it('an empty catalog says so, without a table', async () => {
    await open();
    expect(screen.getByText('Nenhuma insígnia ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('"Nova insígnia" creates with the trimmed texts and the row comes last, without image', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Nova insígnia' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nova insígnia' });
    await userEvent.type(within(sheet).getByLabelText('Nome'), '  Raro ');
    await userEvent.type(within(sheet).getByLabelText('Descrição'), 'Achou o dado de ouro');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Criar' }));
    expect(await screen.findByText('“Raro” criada.')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(namesInOrder()).toEqual(['Veterano', 'Raro']);
    expect(rowOf('Raro')).toHaveTextContent('Sem imagem');
    expect(deps.badgesAdminApi.answers.callsOf('create')).toEqual([
      { name: 'Raro', description: 'Achou o dado de ouro' },
    ]);
    expect(deps.badgesAdminApi.uploads).toEqual([]);
  });

  it('empty texts are refused in the fields without a request', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Nova insígnia' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nova insígnia' });
    await userEvent.type(within(sheet).getByLabelText('Nome'), '   ');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Criar' }));
    expect(within(sheet).getByText('Informe o nome da insígnia.')).toBeInTheDocument();
    expect(within(sheet).getByText('Informe a descrição da insígnia.')).toBeInTheDocument();
    expect(deps.badgesAdminApi.answers.callsOf('create')).toEqual([]);
  });

  it('a name over 40 characters is refused in the field', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Nova insígnia' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nova insígnia' });
    await userEvent.type(within(sheet).getByLabelText('Nome'), 'x'.repeat(41));
    await userEvent.type(within(sheet).getByLabelText('Descrição'), 'Longa demais');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Criar' }));
    expect(within(sheet).getByText('O nome passa de 40 caracteres.')).toBeInTheDocument();
    expect(deps.badgesAdminApi.answers.callsOf('create')).toEqual([]);
  });

  it('a taken name is told under "Nome" and the sheet stays open', async () => {
    deps.badgesAdminApi.answers.answer('create', { ok: false, failure: { kind: 'name_taken' } });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Nova insígnia' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nova insígnia' });
    await userEvent.type(within(sheet).getByLabelText('Nome'), 'veterano');
    await userEvent.type(within(sheet).getByLabelText('Descrição'), 'De novo');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Criar' }));
    expect(
      await within(sheet).findByText('Já existe uma insígnia com esse nome.'),
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog', { name: 'Nova insígnia' })).toBeInTheDocument();
  });

  it('"Editar" saves the name and the description', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    await open();
    await choose('Veterano', 'Editar');
    const sheet = await screen.findByRole('dialog', { name: 'Editar insígnia' });
    const name = within(sheet).getByLabelText('Nome');
    expect(name).toHaveValue('Veterano');
    await userEvent.clear(name);
    await userEvent.type(name, 'Veterana');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('“Veterana” salva.')).toHaveAttribute('role', 'status');
    expect(rowOf('Veterana')).toBeInTheDocument();
    expect(deps.badgesAdminApi.answers.callsOf('update')).toEqual([
      { badgeId: VETERAN_BADGE.id, name: 'Veterana', description: 'Jogou 100 sessões' },
    ]);
  });

  it('deleting asks with how many accounts lose it, and the row leaves only on "Excluir"', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE, NARRATOR_BADGE);
    await open();
    await choose('Veterano', 'Excluir insígnia');
    const dialog = await screen.findByRole('alertdialog', { name: "Excluir 'Veterano'?" });
    expect(dialog).toHaveTextContent('12 contas perdem essa insígnia.');
    expect(rowOf('Veterano')).toBeInTheDocument();
    expect(deps.badgesAdminApi.answers.callsOf('remove')).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('“Veterano” excluída.')).toHaveAttribute('role', 'status');
    expect(namesInOrder()).toEqual(['Narrador']);
    expect(deps.badgesAdminApi.answers.callsOf('remove')).toEqual([VETERAN_BADGE.id]);
  });

  it('"Cancelar" on the deletion keeps the badge', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    await open();
    await choose('Veterano', 'Excluir insígnia');
    const dialog = await screen.findByRole('alertdialog', { name: "Excluir 'Veterano'?" });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(rowOf('Veterano')).toBeInTheDocument();
    expect(deps.badgesAdminApi.answers.callsOf('remove')).toEqual([]);
  });

  it('a lost admin role on load shows "Sem acesso"', async () => {
    deps.badgesAdminApi.answers.answer('catalog', { ok: false, failure: { kind: 'forbidden' } });
    renderAt('/admin/badges');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você não tem mais acesso ao backoffice.',
    );
  });

  it('a load that fails offers "Tentar de novo" with the catalog sentence', async () => {
    deps.badgesAdminApi.answers.answer('catalog', { ok: false, failure: { kind: 'unexpected' } });
    renderAt('/admin/badges');
    expect(
      await screen.findByRole('heading', { name: 'Não deu para carregar as insígnias.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
