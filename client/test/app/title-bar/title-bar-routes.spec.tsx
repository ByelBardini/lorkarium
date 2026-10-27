import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { ANA, ROOT_ADMIN } from '../../support/auth-api-fake';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { DesktopWindowFake } from '../../support/desktop-window-fake';

describe('the window title bar on every route of the desktop shell', () => {
  let deps: TestDependencies;
  let desktopWindow: DesktopWindowFake;

  beforeEach(() => {
    deps = testDependencies();
    desktopWindow = new DesktopWindowFake();
  });

  function renderAt(path: string, inShell = true): void {
    const routes = buildRoutes({ ...deps, desktopWindow: inShell ? desktopWindow : null });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
  }

  const bar = (): HTMLElement => screen.getByRole('banner', { name: 'Barra da janela' });
  const findBar = (): Promise<HTMLElement> =>
    screen.findByRole('banner', { name: 'Barra da janela' });

  it.each([
    ['/login', 'Entrar', null],
    ['/', 'Suas mesas', ANA],
    ['/account', 'Minha conta', ANA],
    ['/campaigns/public', 'Explorar mesas', ANA],
    ['/admin/users', 'Backoffice', ROOT_ADMIN],
  ] as const)('%s shows LORKARIUM / %s', async (path, place, user) => {
    deps.authApi.answerMeWith(user);
    renderAt(path);

    // The boot splash shows the bar first, without a place.
    await waitFor(() => expect(bar()).toHaveTextContent(`LORKARIUM / ${place}`));
  });

  it('the boot splash already has the bar', async () => {
    deps.authApi.holdMe();
    renderAt('/');

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando');
    expect(await findBar()).toBeInTheDocument();
  });

  it('the route error screen has the bar', async () => {
    deps.authApi.crashMe();
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument();
    expect(await findBar()).toBeInTheDocument();
  });

  it.each([
    ['/login', null],
    ['/', ANA],
  ] as const)('in a browser %s has no title bar', async (path, user) => {
    deps.authApi.answerMeWith(user);
    renderAt(path, false);

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('banner', { name: 'Barra da janela' })).not.toBeInTheDocument();
  });

  it('with a dialog open, "Minimizar" reaches the window and the dialog stays open', async () => {
    deps.authApi.answerMeWith(ANA);
    renderAt('/');
    const [newTable] = await screen.findAllByRole('button', { name: 'Nova mesa' });
    await userEvent.click(newTable!);
    const dialog = await screen.findByRole('dialog', { name: 'Nova mesa' });

    // The modal hides everything else from assistive tech (aria-hidden); the mouse still reaches it.
    const hiddenBar = screen.getByRole('banner', { name: 'Barra da janela', hidden: true });
    await userEvent.click(
      within(hiddenBar).getByRole('button', { name: 'Minimizar', hidden: true }),
    );

    expect(desktopWindow.calls).toEqual(['minimize']);
    expect(dialog).toBeInTheDocument();
  });

  it('in the app the rail leaves the logo to the bar', async () => {
    deps.authApi.answerMeWith(ANA);
    renderAt('/');

    const rail = await screen.findByRole('complementary', { name: 'Menu lateral' });
    expect(within(rail).queryByRole('img', { name: 'LORKARIUM' })).not.toBeInTheDocument();
  });

  it('in a browser the rail keeps its logo', async () => {
    deps.authApi.answerMeWith(ANA);
    renderAt('/', false);

    const rail = await screen.findByRole('complementary', { name: 'Menu lateral' });
    expect(within(rail).getByRole('img', { name: 'LORKARIUM' })).toBeInTheDocument();
  });
});
