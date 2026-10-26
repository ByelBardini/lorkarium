import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import {
  ANA_PROFILE,
  UPLOADED_AVATAR_ID,
  UPLOADED_DICE_TEXTURE_ID,
} from '../../support/profile-api-fake';

describe('account route (/account)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  function renderAt(path = '/account'): ReturnType<typeof createMemoryRouter> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
  }

  async function openAccount(): Promise<ReturnType<typeof createMemoryRouter>> {
    const router = renderAt();
    await screen.findByRole('heading', { name: 'Minha conta', level: 1 });
    return router;
  }

  function nickname(): HTMLElement {
    return screen.getByLabelText('Apelido');
  }

  function rail(): HTMLElement {
    return screen.getByRole('complementary', { name: 'Menu lateral' });
  }

  async function rename(name: string): Promise<void> {
    await userEvent.clear(nickname());
    if (name) await userEvent.type(nickname(), name);
  }

  it('loads the nickname, the read-only @, the color marked and since when', async () => {
    await openAccount();
    expect(nickname()).toHaveValue('Ana');
    const preview = screen.getByRole('complementary', { name: 'Como a galera te vê' });
    const profileUsername = screen.getAllByText('@ana').filter((line) => !preview.contains(line));
    expect(profileUsername).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: /Nome de usuário/ })).not.toBeInTheDocument();
    const colors = screen.getByRole('radiogroup', { name: 'Sua cor no mapa' });
    expect(within(colors).getByRole('radio', { name: 'Verde-água' })).toBeChecked();
    expect(screen.getByText('Na mesa desde outubro de 2026')).toBeInTheDocument();
  });

  it('with nothing edited there is no bar of changes', async () => {
    await openAccount();
    expect(screen.queryByRole('region', { name: 'Alterações do perfil' })).not.toBeInTheDocument();
  });

  it('editing the nickname shows the bar, and "Descartar" puts everything back', async () => {
    await openAccount();
    await rename('Aninha');
    const bar = screen.getByRole('region', { name: 'Alterações do perfil' });
    expect(bar).toHaveTextContent('Você tem alterações não salvas.');
    await userEvent.click(within(bar).getByRole('button', { name: 'Descartar' }));
    expect(nickname()).toHaveValue('Ana');
    expect(screen.queryByRole('region', { name: 'Alterações do perfil' })).not.toBeInTheDocument();
  });

  it('the preview follows the draft before it is saved', async () => {
    await openAccount();
    await rename('Aninha');
    const preview = screen.getByRole('complementary', { name: 'Como a galera te vê' });
    // The ping illustration repeats the name inside an aria-hidden SVG; the shown name is the <p>.
    expect(within(preview).getByText('Aninha', { selector: 'p' })).toBeInTheDocument();
  });

  it('saving shows "Salvando…" busy, then "Tudo salvo." and the rail with the new nickname', async () => {
    await openAccount();
    await rename('Aninha');
    const release = deps.profileApi.answers.hold('update');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const bar = screen.getByRole('region', { name: 'Alterações do perfil' });
    expect(within(bar).getByRole('button', { name: /Salvando/ })).toBeDisabled();
    expect(bar).toHaveAttribute('aria-busy', 'true');
    deps.profileApi.profile = { ...ANA_PROFILE, name: 'Aninha' };
    await act(async () => release({ ok: true, value: deps.profileApi.profile }));
    expect(await screen.findByText('Tudo salvo.')).toBeInTheDocument();
    expect(within(rail()).getByText('Aninha')).toBeInTheDocument();
    expect(deps.profileApi.answers.callsOf('update')).toEqual([{ name: 'Aninha' }]);
  });

  it('only the fields that changed are sent: picking a color sends the color alone', async () => {
    await openAccount();
    await userEvent.click(screen.getByRole('radio', { name: 'Rosa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Tudo salvo.');
    expect(deps.profileApi.answers.callsOf('update')).toEqual([{ color: 'rose' }]);
    expect(screen.getByRole('radio', { name: 'Rosa' })).toBeChecked();
  });

  it('an empty nickname is an inline error and the save waits for it', async () => {
    await openAccount();
    await rename('');
    expect(nickname()).toHaveAttribute('aria-invalid', 'true');
    expect(nickname()).toHaveAccessibleDescription('O apelido não pode ficar vazio.');
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it('a bio of 191 characters is an inline error', async () => {
    await openAccount();
    await userEvent.click(screen.getByLabelText('Sobre você'));
    await userEvent.paste('a'.repeat(191));
    expect(screen.getByLabelText('Sobre você')).toHaveAccessibleDescription(
      'Use no máximo 190 caracteres.',
    );
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it('a save refused rate_limited says when to try again, in the bar', async () => {
    deps.profileApi.answers.answer('update', {
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 25 },
    });
    await openAccount();
    await rename('Aninha');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const bar = screen.getByRole('region', { name: 'Alterações do perfil' });
    expect(await within(bar).findByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Tente de novo em 25 s.',
    );
    expect(nickname()).toHaveValue('Aninha');
  });

  it('a save refused unauthenticated goes to the login with next=/account', async () => {
    deps.profileApi.answers.answer('update', { ok: false, failure: { kind: 'unauthenticated' } });
    const router = await openAccount();
    await rename('Aninha');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Faccount');
  });

  it('leaving with an edit asks "Sair sem salvar?": "Continuar editando" stays', async () => {
    const router = await openAccount();
    await rename('Aninha');
    const mainNav = screen.getByRole('navigation', { name: 'Principal' });
    await userEvent.click(within(mainNav).getByRole('link', { name: /Mesas/ }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuar editando' }));
    expect(router.state.location.pathname).toBe('/account');
    expect(nickname()).toHaveValue('Aninha');
  });

  it('"Descartar e sair" lets the navigation go', async () => {
    const router = await openAccount();
    await rename('Aninha');
    const mainNav = screen.getByRole('navigation', { name: 'Principal' });
    await userEvent.click(within(mainNav).getByRole('link', { name: /Mesas/ }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar e sair' }));
    expect(await screen.findByRole('link', { name: /Os Sinos de Vharn/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('leaving with nothing edited does not ask', async () => {
    const router = await openAccount();
    const mainNav = screen.getByRole('navigation', { name: 'Principal' });
    await userEvent.click(within(mainNav).getByRole('link', { name: /Mesas/ }));
    expect(await screen.findByRole('link', { name: /Os Sinos de Vharn/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('offline in the loader shows "Sem conexão", and "Tentar de novo" loads the account', async () => {
    deps.profileApi.answers.answer('get', { ok: false, failure: { kind: 'offline' } });
    renderAt();
    expect(await screen.findByRole('heading', { name: 'Sem conexão' })).toBeInTheDocument();
    deps.profileApi.answers.clear('get');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(
      await screen.findByRole('heading', { name: 'Minha conta', level: 1 }),
    ).toBeInTheDocument();
  });

  it('a broken answer in the loader says the account could not load', async () => {
    deps.accountSecurityApi.answers.answer('security', {
      ok: false,
      failure: { kind: 'unexpected' },
    });
    renderAt();
    expect(
      await screen.findByRole('heading', { name: 'Não deu para carregar sua conta.' }),
    ).toBeInTheDocument();
  });

  it('a session that fell in the loader goes to the login with next=/account', async () => {
    deps.accountSecurityApi.answers.answer('sessions', {
      ok: false,
      failure: { kind: 'unauthenticated' },
    });
    const router = renderAt();
    expect(await screen.findByRole('heading', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Faccount');
  });

  describe('foto', () => {
    function png(bytes = 4): File {
      return new File([new Uint8Array(bytes)], 'eu.png', { type: 'image/png' });
    }

    function photoField(): HTMLElement {
      return screen.getByRole('group', { name: 'Foto' });
    }

    it('choosing a PNG shows "Enviando…", then the new photo in the profile, the preview and the rail', async () => {
      await openAccount();
      const release = deps.profileApi.answers.hold('uploadAvatar');
      await userEvent.upload(screen.getByLabelText('Escolher foto'), png());
      expect(await within(photoField()).findByText('Enviando…')).toBeInTheDocument();
      deps.profileApi.profile = { ...ANA_PROFILE, avatarId: UPLOADED_AVATAR_ID };
      await act(async () => release({ ok: true, value: deps.profileApi.profile }));
      await waitFor(() =>
        expect(screen.getByRole('img', { name: 'Sua foto' })).toHaveAttribute(
          'src',
          `/api/avatars/${UPLOADED_AVATAR_ID}`,
        ),
      );
      const preview = screen.getByRole('complementary', { name: 'Como a galera te vê' });
      expect(within(preview).getByTestId('avatar-photo')).toHaveAttribute(
        'src',
        `/api/avatars/${UPLOADED_AVATAR_ID}`,
      );
      expect(within(rail()).getByTestId('avatar-photo')).toHaveAttribute(
        'src',
        `/api/avatars/${UPLOADED_AVATAR_ID}`,
      );
    });

    it('dropping a file on the circle sends it the same way, and dragging over says "Solta aqui"', async () => {
      await openAccount();
      const area = screen.getByRole('group', { name: 'Área da foto' });
      fireEvent.dragOver(area);
      expect(within(area).getByText('Solta aqui')).toBeInTheDocument();
      const file = png();
      await act(async () => {
        fireEvent.drop(area, { dataTransfer: { files: [file] } });
      });
      expect(deps.profileApi.answers.callsOf('uploadAvatar')).toEqual([file]);
      await waitFor(() =>
        expect(screen.getByRole('img', { name: 'Sua foto' })).toHaveAttribute(
          'src',
          `/api/avatars/${UPLOADED_AVATAR_ID}`,
        ),
      );
    });

    it('"Usar um link" takes a GIF link: the photo changes and the field closes', async () => {
      await openAccount();
      await userEvent.click(within(photoField()).getByRole('button', { name: 'Usar um link' }));
      const link = within(photoField()).getByRole('textbox', { name: 'Link da imagem' });
      expect(link).toHaveFocus();
      await userEvent.type(link, 'https://media.example.com/dado.gif');
      await userEvent.click(within(photoField()).getByRole('button', { name: 'Usar link' }));
      await waitFor(() =>
        expect(screen.getByRole('img', { name: 'Sua foto' })).toHaveAttribute(
          'src',
          `/api/avatars/${UPLOADED_AVATAR_ID}`,
        ),
      );
      expect(deps.profileApi.answers.callsOf('avatarFromLink')).toEqual([
        'https://media.example.com/dado.gif',
      ]);
      expect(within(photoField()).queryByRole('textbox', { name: 'Link da imagem' })).toBeNull();
    });

    it.each([
      ['link_blocked', 'Esse link não pode ser usado.'],
      ['link_unreachable', 'Não deu para baixar esse link. Confira o endereço.'],
      [
        'link_not_image',
        'Esse link não é de uma imagem. Abra a imagem (ou o GIF) e copie o endereço dela.',
      ],
    ] as const)('a link refused as %s says "%s" and stays typed', async (kind, message) => {
      deps.profileApi.answers.answer('avatarFromLink', { ok: false, failure: { kind } });
      await openAccount();
      await userEvent.click(within(photoField()).getByRole('button', { name: 'Usar um link' }));
      const link = within(photoField()).getByRole('textbox', { name: 'Link da imagem' });
      await userEvent.type(link, 'https://x.com/pagina{Enter}');
      expect(await within(photoField()).findByRole('alert')).toHaveTextContent(message);
      expect(link).toHaveValue('https://x.com/pagina');
    });

    it('a file of 6 MB is refused before sending', async () => {
      await openAccount();
      await userEvent.upload(screen.getByLabelText('Escolher foto'), png(6 * 1024 * 1024));
      expect(within(photoField()).getByRole('alert')).toHaveTextContent(
        'A foto pode ter até 5 MB.',
      );
      expect(deps.profileApi.answers.callsOf('uploadAvatar')).toEqual([]);
    });

    it('a file the server cannot read says which images work', async () => {
      deps.profileApi.answers.answer('uploadAvatar', {
        ok: false,
        failure: { kind: 'unsupported_image' },
      });
      await openAccount();
      await userEvent.upload(screen.getByLabelText('Escolher foto'), png());
      expect(await within(photoField()).findByRole('alert')).toHaveTextContent(
        'Esse arquivo não é uma imagem que dá para usar (PNG, JPEG, WebP ou GIF).',
      );
    });

    it('"Tirar foto" goes back to the initials, without the bar of changes', async () => {
      deps.profileApi.profile = { ...ANA_PROFILE, avatarId: UPLOADED_AVATAR_ID };
      await openAccount();
      await userEvent.click(screen.getByRole('button', { name: 'Tirar foto' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: /Tirar foto|Tirando/ }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('img', { name: 'Sua foto' })).toHaveTextContent('AN');
      expect(
        screen.queryByRole('region', { name: 'Alterações do perfil' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('dados', () => {
    const TEXTURE_URL = `/api/dice-textures/${UPLOADED_DICE_TEXTURE_ID}`;

    function png(bytes = 4): File {
      return new File([new Uint8Array(bytes)], 'pedra.png', { type: 'image/png' });
    }

    function diceField(): HTMLElement {
      return screen.getByRole('group', { name: 'Seus dados' });
    }

    function dicePreview(): HTMLElement {
      return within(diceField()).getByRole('img', { name: 'Prévia do seu dado' });
    }

    function diceBase(): Element | null {
      return dicePreview().querySelector('polygon');
    }

    function withTexture(): void {
      deps.profileApi.profile = { ...ANA_PROFILE, diceTextureId: UPLOADED_DICE_TEXTURE_ID };
    }

    it('"Dados 3D" sits in Minha conta and turns off at once, outside the bar of changes', async () => {
      await openAccount();
      const toggle = screen.getByRole('switch', { name: 'Dados 3D' });
      expect(toggle).toBeChecked();

      await userEvent.click(toggle);

      expect(toggle).not.toBeChecked();
      expect(deps.dicePreferences.getState().threeD).toBe(false);
      expect(screen.queryByRole('region', { name: 'Alterações do perfil' })).toBeNull();
    });

    it('the preview is a d20 in the profile color, with the number in automatic contrast', async () => {
      await openAccount();
      expect(diceBase()).toHaveAttribute('fill', '#5cc8c0');
      expect(within(dicePreview()).getByTestId('dice-number')).toHaveAttribute('fill', '#1a1a1a');
      expect(within(dicePreview()).queryByTestId('dice-texture')).toBeNull();
      expect(within(diceField()).queryByLabelText('Cor do número')).toBeNull();
    });

    it('the preview follows the color picked before it is saved', async () => {
      await openAccount();
      const colors = screen.getByRole('radiogroup', { name: 'Sua cor no mapa' });
      await userEvent.click(within(colors).getByRole('radio', { name: 'Ouro' }));
      expect(diceBase()).toHaveAttribute('fill', '#e0b25c');
    });

    it('choosing a file shows "Enviando…", then the texture in the preview and "Cor do número"', async () => {
      await openAccount();
      const release = deps.profileApi.answers.hold('uploadDiceTexture');
      const file = png();
      await userEvent.upload(within(diceField()).getByLabelText('Arquivo de imagem'), file);
      expect(await within(diceField()).findByText('Enviando…')).toBeInTheDocument();
      withTexture();
      await act(async () => release({ ok: true, value: deps.profileApi.profile }));
      await waitFor(() =>
        expect(within(dicePreview()).getByTestId('dice-texture')).toHaveAttribute(
          'href',
          TEXTURE_URL,
        ),
      );
      expect(deps.profileApi.answers.callsOf('uploadDiceTexture')).toEqual([file]);
      expect(within(dicePreview()).getByTestId('dice-number')).toHaveAttribute('fill', '#ffffff');
      expect(within(diceField()).getByLabelText('Cor do número')).toHaveValue('#ffffff');
      expect(
        screen.queryByRole('region', { name: 'Alterações do perfil' }),
      ).not.toBeInTheDocument();
    });

    it('"Cor do número" enters the bar of changes and is saved by the PATCH alone', async () => {
      withTexture();
      await openAccount();
      fireEvent.change(within(diceField()).getByLabelText('Cor do número'), {
        target: { value: '#ff3366' },
      });
      expect(within(dicePreview()).getByTestId('dice-number')).toHaveAttribute('fill', '#ff3366');
      const bar = screen.getByRole('region', { name: 'Alterações do perfil' });
      await userEvent.click(within(bar).getByRole('button', { name: 'Salvar alterações' }));
      expect(await screen.findByText('Tudo salvo.')).toBeInTheDocument();
      expect(deps.profileApi.answers.callsOf('update')).toEqual([{ diceNumberColor: '#ff3366' }]);
      expect(within(diceField()).getByLabelText('Cor do número')).toHaveValue('#ff3366');
    });

    it('"Tirar textura" goes back to the color, without "Cor do número" nor the bar', async () => {
      withTexture();
      await openAccount();
      await userEvent.click(within(diceField()).getByRole('button', { name: 'Tirar textura' }));
      await waitFor(() => expect(within(dicePreview()).queryByTestId('dice-texture')).toBeNull());
      expect(deps.profileApi.answers.callsOf('removeDiceTexture')).toHaveLength(1);
      expect(diceBase()).toHaveAttribute('fill', '#5cc8c0');
      expect(within(diceField()).queryByLabelText('Cor do número')).toBeNull();
      expect(
        screen.queryByRole('region', { name: 'Alterações do perfil' }),
      ).not.toBeInTheDocument();
    });

    it('a file of 6 MB says "A imagem passa de 5 MB." without sending', async () => {
      await openAccount();
      const input = within(diceField()).getByLabelText('Arquivo de imagem');
      await userEvent.upload(input, png(6 * 1024 * 1024));
      expect(within(diceField()).getByRole('alert')).toHaveTextContent('A imagem passa de 5 MB.');
      expect(deps.profileApi.answers.callsOf('uploadDiceTexture')).toEqual([]);
    });

    it('a link refused says why in the field alert, with the link still typed', async () => {
      deps.profileApi.answers.answer('diceTextureFromLink', {
        ok: false,
        failure: { kind: 'link_not_image' },
      });
      await openAccount();
      await userEvent.click(
        within(diceField()).getByRole('button', { name: 'Usar link de imagem' }),
      );
      const link = within(diceField()).getByRole('textbox', { name: 'Link da imagem' });
      await userEvent.type(link, 'https://x.com/pagina{Enter}');
      expect(await within(diceField()).findByRole('alert')).toHaveTextContent(
        'Esse link não é de uma imagem. Abra a imagem (ou o GIF) e copie o endereço dela.',
      );
      expect(link).toHaveValue('https://x.com/pagina');
      expect(deps.profileApi.answers.callsOf('diceTextureFromLink')).toEqual([
        'https://x.com/pagina',
      ]);
    });

    it('a link kept shows the texture and closes the link field', async () => {
      await openAccount();
      await userEvent.click(
        within(diceField()).getByRole('button', { name: 'Usar link de imagem' }),
      );
      const link = within(diceField()).getByRole('textbox', { name: 'Link da imagem' });
      await userEvent.type(link, 'https://media.example.com/pedra.png{Enter}');
      await waitFor(() =>
        expect(within(dicePreview()).getByTestId('dice-texture')).toHaveAttribute(
          'href',
          TEXTURE_URL,
        ),
      );
      expect(within(diceField()).queryByRole('textbox', { name: 'Link da imagem' })).toBeNull();
    });
  });
});
