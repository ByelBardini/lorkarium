import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import type { CampaignsFailure } from '@/services/campaigns-api';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, QUELM, VHARN } from '../../support/campaigns-api-fake';
import { vharnBoard, vharnState } from '../../support/table-session-fixtures';

const ROOM_PATH = `/campaigns/${VHARN.id}/table`;
const SETTINGS_PATH = `${ROOM_PATH}/settings`;

describe('campaign settings page', () => {
  let deps: TestDependencies;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  function renderAt(path: string): void {
    router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
  }

  // VHARN's room, live, as the master; then its "Configurações da mesa" button.
  async function openSettings(overrides: Parameters<typeof detailOf>[1] = {}) {
    deps.campaignsApi.answer('detail', { ok: true, value: detailOf(VHARN, overrides) });
    renderAt(ROOM_PATH);
    await screen.findByRole('heading', { level: 1, name: VHARN.name });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard() },
    );
    await act(() => Promise.resolve());
    await userEvent.click(screen.getByRole('link', { name: 'Configurações da mesa' }));
    return screen.findByRole('form', { name: 'Configurações da mesa' });
  }

  function pageHeading(): HTMLElement {
    return screen.getByRole('heading', { level: 1, name: 'Configurações da mesa' });
  }

  function bar(): HTMLElement {
    return screen.getByRole('region', { name: 'Alterações da mesa' });
  }

  async function save(): Promise<void> {
    await userEvent.click(within(bar()).getByRole('button', { name: 'Salvar alterações' }));
  }

  function lastUpdateInput(): unknown {
    const calls = deps.campaignsApi.callsOf('update') as Array<{ input: unknown }>;
    return calls.at(-1)?.input;
  }

  describe('form', () => {
    it('starts at the confirmed campaign, without the bar', async () => {
      const form = await openSettings();
      expect(within(form).getByLabelText('Nome da mesa')).toHaveValue(VHARN.name);
      expect(within(form).getByLabelText('Sistema')).toHaveValue('D&D 5e');
      expect(within(form).getByLabelText('Sobre a mesa')).toHaveValue(VHARN.description);
      const status = within(form).getByRole('radiogroup', { name: 'Status' });
      expect(within(status).getByRole('radio', { name: 'Recrutando' })).toBeChecked();
      const visibility = within(form).getByRole('radiogroup', { name: 'Visibilidade' });
      expect(within(visibility).getByRole('radio', { name: 'Privada' })).toBeChecked();
      expect(within(form).getByRole('button', { name: 'Terror' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(within(form).getByRole('button', { name: 'Gore' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(within(form).getByRole('list', { name: 'Tags' })).toHaveTextContent(
        'InvestigaçãoMasmorra',
      );
      expect(
        within(form).getByRole('switch', { name: 'Pedir senha para entrar' }),
      ).not.toBeChecked();
      expect(screen.queryByRole('region', { name: 'Alterações da mesa' })).not.toBeInTheDocument();
    });

    it('the first change shows the bar, and "Descartar" puts every field back', async () => {
      const form = await openSettings();
      await userEvent.type(within(form).getByLabelText('Nome da mesa'), ' II');
      await userEvent.click(within(form).getByRole('button', { name: 'Gore' }));
      expect(within(bar()).getByRole('status')).toHaveTextContent(
        'Você tem alterações não salvas.',
      );

      await userEvent.click(within(bar()).getByRole('button', { name: 'Descartar' }));

      expect(within(form).getByLabelText('Nome da mesa')).toHaveValue(VHARN.name);
      expect(within(form).getByRole('button', { name: 'Gore' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.queryByRole('region', { name: 'Alterações da mesa' })).not.toBeInTheDocument();
    });

    it('an empty name blocks "Salvar alterações" and marks the field', async () => {
      const form = await openSettings();
      const name = within(form).getByLabelText('Nome da mesa');
      await userEvent.clear(name);
      expect(name).toHaveAttribute('aria-invalid', 'true');
      expect(form).toHaveTextContent('Informe o nome da mesa.');
      expect(within(bar()).getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    });

    it('saves only what changed, then says "Tudo salvo." and shows the reloaded campaign', async () => {
      const form = await openSettings();
      const renamed = detailOf(VHARN, { name: 'Os Sinos Calados', status: 'ongoing' });
      deps.campaignsApi.answer('update', { ok: true, value: renamed });
      const name = within(form).getByLabelText('Nome da mesa');
      await userEvent.clear(name);
      await userEvent.type(name, 'Os Sinos Calados');
      await userEvent.click(within(form).getByRole('radio', { name: 'Em andamento' }));
      deps.campaignsApi.answer('detail', { ok: true, value: renamed });

      await save();

      // Queried again: the reloaded campaign matches the edits, so the bar is mounted anew.
      await waitFor(() => expect(bar()).toHaveTextContent('Tudo salvo.'));
      expect(deps.campaignsApi.callsOf('update')).toEqual([
        { campaignId: VHARN.id, input: { name: 'Os Sinos Calados', status: 'ongoing' } },
      ]);
      expect(deps.campaignsApi.callsOf('detail')).toHaveLength(2);
      expect(pageHeading().parentElement).toHaveTextContent('Os Sinos Calados');
      expect(within(form).getByLabelText('Nome da mesa')).toHaveValue('Os Sinos Calados');
    });

    it('while saving: "Salvando…" and the bar busy', async () => {
      const form = await openSettings();
      const release = deps.campaignsApi.hold('update');
      await userEvent.type(within(form).getByLabelText('Sistema'), ' (2024)');

      await save();

      expect(bar()).toHaveAttribute('aria-busy', 'true');
      expect(within(bar()).getByRole('button', { name: 'Salvando…' })).toBeDisabled();
      await act(async () => release({ ok: true, value: detailOf(VHARN) }));
      expect(await within(bar()).findByText('Tudo salvo.')).toBeInTheDocument();
    });

    it.each<[string, CampaignsFailure, string]>([
      ['forbidden', { kind: 'forbidden' }, 'Só o mestre da mesa pode fazer isso.'],
      ['not_open', { kind: 'not_open' }, 'Abra a mesa para mudar as configurações.'],
      ['invalid', { kind: 'invalid' }, 'Confira os campos e tente de novo.'],
      [
        'rate_limited',
        { kind: 'rate_limited', retryAfterSeconds: 30 },
        'Muitas tentativas. Tente de novo em 30 s.',
      ],
      ['offline', { kind: 'offline' }, 'Sem conexão com o servidor'],
    ])('a %s refusal stays in the bar with the edit', async (_, failure, message) => {
      const form = await openSettings();
      deps.campaignsApi.answer('update', { ok: false, failure });
      await userEvent.type(within(form).getByLabelText('Nome da mesa'), ' II');

      await save();

      expect(await within(bar()).findByRole('alert')).toHaveTextContent(message);
      expect(within(form).getByLabelText('Nome da mesa')).toHaveValue(`${VHARN.name} II`);
    });
  });

  describe('warnings and tags', () => {
    it('warnings toggle by aria-pressed and go in the body', async () => {
      const form = await openSettings();
      const violence = within(form).getByRole('button', { name: 'Violência' });
      await userEvent.click(violence);
      await userEvent.click(within(form).getByRole('button', { name: 'Terror' }));
      expect(violence).toHaveAttribute('aria-pressed', 'true');

      await save();

      await waitFor(() => expect(lastUpdateInput()).toEqual({ contentWarnings: ['violence'] }));
    });

    it('Enter and comma add a tag, Backspace on the empty field takes the last one', async () => {
      const form = await openSettings();
      const input = within(form).getByRole('textbox', { name: 'Nova tag' });
      await userEvent.type(input, 'Horror{Enter}');
      await userEvent.type(input, 'Sandbox,');
      await userEvent.type(input, 'Gótico{Enter}{Backspace}');
      expect(input).toHaveValue('');

      await save();

      await waitFor(() =>
        expect(lastUpdateInput()).toEqual({
          tags: ['Investigação', 'Masmorra', 'Horror', 'Sandbox'],
        }),
      );
    });

    it('a suggestion adds with one click and a chip comes out by its button', async () => {
      const form = await openSettings();
      await userEvent.click(within(form).getByRole('button', { name: 'Adicionar a tag One-shot' }));
      await userEvent.click(within(form).getByRole('button', { name: 'Remover a tag Masmorra' }));
      expect(
        within(form).queryByRole('button', { name: 'Adicionar a tag One-shot' }),
      ).not.toBeInTheDocument();

      await save();

      await waitFor(() =>
        expect(lastUpdateInput()).toEqual({ tags: ['Investigação', 'One-shot'] }),
      );
    });
  });

  describe('password', () => {
    it('another field changed keeps the password (no password in the body)', async () => {
      const form = await openSettings({ hasPassword: true });
      expect(within(form).getByRole('switch', { name: 'Pedir senha para entrar' })).toBeChecked();
      await userEvent.type(within(form).getByLabelText('Nome da mesa'), ' II');

      await save();

      await waitFor(() => expect(lastUpdateInput()).toEqual({ name: `${VHARN.name} II` }));
    });

    it('a new password typed replaces it', async () => {
      const form = await openSettings({ hasPassword: true });
      await userEvent.type(within(form).getByLabelText('Nova senha'), 'sino-novo');

      await save();

      await waitFor(() => expect(lastUpdateInput()).toEqual({ password: 'sino-novo' }));
    });

    it('switching it off removes it (password null)', async () => {
      const form = await openSettings({ hasPassword: true });
      await userEvent.click(within(form).getByRole('switch', { name: 'Pedir senha para entrar' }));

      await save();

      await waitFor(() => expect(lastUpdateInput()).toEqual({ password: null }));
    });

    it('switching it on without a password asks for one and blocks saving', async () => {
      const form = await openSettings();
      await userEvent.click(within(form).getByRole('switch', { name: 'Pedir senha para entrar' }));
      const password = within(form).getByLabelText('Senha da mesa');
      expect(password).toHaveFocus();
      expect(form).toHaveTextContent('Informe a senha da mesa.');
      expect(within(bar()).getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();

      await userEvent.type(password, 'sino');
      await save();

      await waitFor(() => expect(lastUpdateInput()).toEqual({ password: 'sino' }));
    });
  });

  describe('page in the room', () => {
    it('opens from the room as a page over it, and the table stays open', async () => {
      await openSettings();
      expect(router.state.location.pathname).toBe(SETTINGS_PATH);
      expect(pageHeading()).toBeInTheDocument();
      expect(deps.tableSessionApi.closedIds).toEqual([]);
      expect(deps.openTables.getState().tables.map((table) => table.campaignId)).toEqual([
        VHARN.id,
      ]);
    });

    it('the side menu names the four sections of the form and jumps to one', async () => {
      await openSettings();
      const menu = screen.getByRole('navigation', { name: 'Seções das configurações' });
      expect(
        within(menu)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual(['Geral', 'Conteúdo', 'Acesso', 'Zona de perigo']);
      await userEvent.click(within(menu).getByRole('button', { name: 'Acesso' }));
      expect(screen.getByRole('region', { name: 'Acesso' })).toHaveFocus();
    });

    // Regression: `scrollIntoView` also scrolled the clipped page and the room under it, which
    // pushed the header ("Voltar à mesa") and the menu off the screen.
    it('a jump scrolls only the page scroller, never the page or the room', async () => {
      await openSettings();
      const scroller = document.querySelector<HTMLElement>('[data-settings-scroller]');
      if (!scroller) throw new Error('Expected the settings page scroller, found none');
      const scrolled: string[] = [];
      scroller.scrollTo = () => scrolled.push('scroller');
      const intoView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = () => scrolled.push('into-view');
      const menu = screen.getByRole('navigation', { name: 'Seções das configurações' });

      await userEvent.click(within(menu).getByRole('button', { name: 'Zona de perigo' }));
      Element.prototype.scrollIntoView = intoView;

      expect(scrolled).toEqual(['scroller']);
      expect(scroller).toHaveClass('relative');
    });

    it('"Voltar à mesa" without edits goes straight back to the room', async () => {
      await openSettings();
      await userEvent.click(screen.getByRole('link', { name: 'Voltar à mesa' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('form', { name: 'Configurações da mesa' }),
        ).not.toBeInTheDocument(),
      );
      expect(router.state.location.pathname).toBe(ROOM_PATH);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('the room keys do not reach the hidden board while the page is open', async () => {
      await openSettings();
      screen.getByRole('link', { name: 'Voltar à mesa' }).focus();
      await userEvent.keyboard('f');
      expect(deps.roomLayout.getState().focus).toBe(false);
    });

    it('a player has no settings button, and the URL takes them back to the room', async () => {
      deps.campaignsApi.answer('detail', { ok: true, value: detailOf(QUELM) });
      renderAt(`/campaigns/${QUELM.id}/table/settings`);
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(`/campaigns/${QUELM.id}/table`),
      );
      await screen.findByRole('heading', { level: 1, name: QUELM.name });
      expect(screen.queryByRole('link', { name: 'Configurações da mesa' })).not.toBeInTheDocument();
      expect(screen.queryByRole('form', { name: 'Configurações da mesa' })).not.toBeInTheDocument();
    });
  });

  describe('pending edits', () => {
    it('"Voltar à mesa" with an edit asks first: staying keeps it, discarding goes', async () => {
      const form = await openSettings();
      await userEvent.type(within(form).getByLabelText('Nome da mesa'), ' II');
      const back = screen.getByRole('link', { name: 'Voltar à mesa' });

      await userEvent.click(back);
      const ask = await screen.findByRole('alertdialog', { name: 'Descartar alterações?' });
      await userEvent.click(within(ask).getByRole('button', { name: 'Continuar editando' }));
      expect(router.state.location.pathname).toBe(SETTINGS_PATH);
      expect(within(form).getByLabelText('Nome da mesa')).toHaveValue(`${VHARN.name} II`);

      await userEvent.click(back);
      const again = await screen.findByRole('alertdialog', { name: 'Descartar alterações?' });
      await userEvent.click(within(again).getByRole('button', { name: 'Descartar' }));
      await waitFor(() => expect(router.state.location.pathname).toBe(ROOM_PATH));
    });

    it('leaving for another route (the rail) with an edit asks first and discarding goes', async () => {
      const form = await openSettings();
      await userEvent.type(within(form).getByLabelText('Nome da mesa'), ' II');
      const rail = screen.getByRole('navigation', { name: 'Principal' });

      await userEvent.click(within(rail).getByRole('link', { name: 'Mesas' }));
      const ask = await screen.findByRole('alertdialog', { name: 'Descartar alterações?' });
      expect(router.state.location.pathname).toBe(SETTINGS_PATH);
      await userEvent.click(within(ask).getByRole('button', { name: 'Descartar' }));

      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    });
  });

  describe('join code', () => {
    it('"Gerar outro" confirms first, then shows the new code', async () => {
      const form = await openSettings();
      expect(form).toHaveTextContent('VHRN-7K2Q');
      deps.campaignsApi.answer('detail', {
        ok: true,
        value: detailOf(VHARN, { joinCode: 'QWER5TYU' }),
      });

      await userEvent.click(within(form).getByRole('button', { name: 'Gerar outro' }));
      const ask = await screen.findByRole('alertdialog', { name: 'Gerar outro código?' });
      await userEvent.click(within(ask).getByRole('button', { name: 'Gerar outro código' }));

      expect(await within(form).findByText('QWER-5TYU')).toBeInTheDocument();
      expect(deps.campaignsApi.callsOf('regenerateCode')).toEqual([VHARN.id]);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(form).toHaveTextContent('Código novo gerado. O antigo não vale mais.');
    });

    it('a refusal stays in the confirmation', async () => {
      const form = await openSettings();
      deps.campaignsApi.answer('regenerateCode', { ok: false, failure: { kind: 'forbidden' } });
      await userEvent.click(within(form).getByRole('button', { name: 'Gerar outro' }));
      const ask = await screen.findByRole('alertdialog', { name: 'Gerar outro código?' });
      await userEvent.click(within(ask).getByRole('button', { name: 'Gerar outro código' }));

      expect(await within(ask).findByRole('alert')).toHaveTextContent(
        'Só o mestre da mesa pode fazer isso.',
      );
      expect(form).toHaveTextContent('VHRN-7K2Q');
    });
  });

  describe('cover image', () => {
    it('an image sent with purpose "cover" enters the bar and goes in the body', async () => {
      const form = await openSettings();
      const png = new File([new Uint8Array(1024)], 'capa', { type: 'image/png' });

      await userEvent.upload(within(form).getByLabelText('Arquivo de imagem'), png);

      expect(await within(bar()).findByRole('status')).toHaveTextContent(
        'Você tem alterações não salvas.',
      );
      expect(deps.assets.sent).toMatchObject([
        { kind: 'upload', campaignId: VHARN.id, purpose: 'cover' },
      ]);
      await save();
      await waitFor(() =>
        expect(lastUpdateInput()).toEqual({ cover: { kind: 'image', assetId: LYRA_PORTRAIT.id } }),
      );
    });
  });

  describe('delete', () => {
    it('only with the exact name: deletes, closes the table in this tab and goes to /', async () => {
      deps.openTables
        .getState()
        .open({ campaignId: VHARN.id, name: VHARN.name, castSceneId: detailOf(VHARN).castSceneId });
      const form = await openSettings();

      await userEvent.click(within(form).getByRole('button', { name: 'Excluir mesa' }));
      const ask = await screen.findByRole('alertdialog', { name: `Excluir “${VHARN.name}”?` });
      const confirm = within(ask).getByRole('button', { name: 'Excluir para sempre' });
      expect(confirm).toBeDisabled();
      const nameInput = within(ask).getByRole('textbox');
      await userEvent.type(nameInput, 'Os Sinos');
      expect(confirm).toBeDisabled();
      await userEvent.type(nameInput, ' de Vharn');
      expect(confirm).toBeEnabled();

      await userEvent.click(confirm);

      await waitFor(() => expect(router.state.location.pathname).toBe('/'));
      expect(deps.campaignsApi.callsOf('remove')).toEqual([VHARN.id]);
      expect(deps.tableSessionApi.closedIds).toEqual([VHARN.id]);
    });

    it('a refusal stays in the dialog and nothing closes', async () => {
      const form = await openSettings();
      deps.campaignsApi.answer('remove', { ok: false, failure: { kind: 'offline' } });
      await userEvent.click(within(form).getByRole('button', { name: 'Excluir mesa' }));
      const ask = await screen.findByRole('alertdialog', { name: `Excluir “${VHARN.name}”?` });
      await userEvent.type(within(ask).getByRole('textbox'), VHARN.name);
      await userEvent.click(within(ask).getByRole('button', { name: 'Excluir para sempre' }));

      expect(await within(ask).findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
      expect(router.state.location.pathname).toBe(SETTINGS_PATH);
    });
  });

  it('a session that fell while saving goes to the login', async () => {
    const form = await openSettings();
    deps.campaignsApi.answer('update', { ok: false, failure: { kind: 'unauthenticated' } });
    await userEvent.type(within(form).getByLabelText('Nome da mesa'), ' II');

    await save();

    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
  });
});
