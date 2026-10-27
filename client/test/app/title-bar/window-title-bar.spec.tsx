import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { WindowTitleBar } from '@/app/title-bar/window-title-bar';
import { DesktopWindowFake } from '../../support/desktop-window-fake';

function renderBar(desktopWindow: DesktopWindowFake, place: string | null = 'Suas mesas'): void {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Início</p> },
      {
        path: '/account',
        element: <WindowTitleBar desktopWindow={desktopWindow} place={place} />,
      },
    ],
    { initialEntries: ['/account'] },
  );
  render(<RouterProvider router={router} />);
}

const bar = (): HTMLElement => screen.getByRole('banner', { name: 'Barra da janela' });
const control = (name: string): HTMLElement => within(bar()).getByRole('button', { name });

describe('WindowTitleBar', () => {
  afterEach(() => document.documentElement.style.removeProperty('--title-bar-height'));

  it('shows the logo as a link to "Suas mesas" and LORKARIUM / the place', () => {
    renderBar(new DesktopWindowFake());

    expect(within(bar()).getByRole('link', { name: 'Ir para Suas mesas' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(bar()).toHaveTextContent('LORKARIUM / Suas mesas');
  });

  it('without a place, only LORKARIUM', () => {
    renderBar(new DesktopWindowFake(), null);

    expect(bar()).toHaveTextContent('LORKARIUM');
    expect(bar()).not.toHaveTextContent('/');
  });

  it('the logo goes to "Suas mesas"', async () => {
    renderBar(new DesktopWindowFake());

    await userEvent.click(within(bar()).getByRole('link', { name: 'Ir para Suas mesas' }));

    expect(await screen.findByText('Início')).toBeInTheDocument();
  });

  it.each([
    ['Minimizar', 'minimize'],
    ['Maximizar', 'toggleMaximize'],
    ['Fechar', 'close'],
  ] as const)('"%s" asks the window to %s', async (name, call) => {
    const desktopWindow = new DesktopWindowFake();
    renderBar(desktopWindow);

    await userEvent.click(control(name));

    expect(desktopWindow.calls).toEqual([call]);
  });

  it('maximized, the button becomes "Restaurar" with the other icon', async () => {
    const desktopWindow = new DesktopWindowFake();
    renderBar(desktopWindow);
    const maximizeIcon = control('Maximizar').innerHTML;

    act(() => desktopWindow.resize(true));

    expect(await within(bar()).findByRole('button', { name: 'Restaurar' })).not.toContainHTML(
      maximizeIcon,
    );
    act(() => desktopWindow.resize(false));
    expect(await within(bar()).findByRole('button', { name: 'Maximizar' })).toBeInTheDocument();
  });

  it('a window that refuses leaves the bar standing and the button clickable', async () => {
    const desktopWindow = new DesktopWindowFake(true);
    renderBar(desktopWindow);

    await userEvent.click(control('Minimizar'));
    await userEvent.click(control('Minimizar'));

    expect(desktopWindow.calls).toEqual(['minimize', 'minimize']);
    expect(bar()).toBeInTheDocument();
  });

  it('the bar dims while the window has no focus', () => {
    renderBar(new DesktopWindowFake());

    act(() => window.dispatchEvent(new Event('blur')));
    expect(bar()).toHaveAttribute('data-focused', 'false');

    act(() => window.dispatchEvent(new Event('focus')));
    expect(bar()).toHaveAttribute('data-focused', 'true');
  });

  it('the bar drags the window and the logo and buttons do not', () => {
    renderBar(new DesktopWindowFake());

    expect(bar()).toHaveAttribute('data-app-region', 'drag');
    expect(within(bar()).getByRole('link', { name: 'Ir para Suas mesas' })).toHaveAttribute(
      'data-app-region',
      'no-drag',
    );
    for (const name of ['Minimizar', 'Maximizar', 'Fechar']) {
      expect(control(name)).toHaveAttribute('data-app-region', 'no-drag');
    }
  });

  it('the window buttons stay out of the Tab order, like the native ones', () => {
    renderBar(new DesktopWindowFake());

    for (const name of ['Minimizar', 'Maximizar', 'Fechar']) {
      expect(control(name)).toHaveAttribute('tabindex', '-1');
    }
  });

  it('there is always room to grab the window', () => {
    renderBar(new DesktopWindowFake());

    expect(within(bar()).getByTestId('title-bar-drag-area')).toHaveClass('min-w-12');
  });

  it('the hint of the maximize button tells about Win+Z', async () => {
    renderBar(new DesktopWindowFake());

    await userEvent.hover(control('Maximizar'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Win+Z');
  });

  it('measures 38 px and tells the page through --title-bar-height', () => {
    renderBar(new DesktopWindowFake());

    expect(bar()).toHaveAttribute('data-variant', 'place');
    expect(document.documentElement.style.getPropertyValue('--title-bar-height')).toBe('38px');
  });
});
