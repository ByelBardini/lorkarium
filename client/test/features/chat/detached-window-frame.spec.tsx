import { act, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ChatWindowPortal } from '@/features/chat/chat-window-portal';
import { DetachedWindowFrame } from '@/features/chat/detached-window-frame';
import type { ChatWindow } from '@/features/chat/use-chat-window';
import { ChatWindowFake } from '../../support/chat-window-host-fake';
import { DesktopWindowFake } from '../../support/desktop-window-fake';

describe('detached panel title bar', () => {
  it('controls its own native window and sets the title and dialog offset in the popup document', async () => {
    const popup = new ChatWindowFake();
    const controls = new DesktopWindowFake();
    const state: ChatWindow = {
      status: 'detached',
      closeError: null,
      portalTarget: popup.document.body,
      desktopWindow: controls,
      canAlwaysOnTop: true,
      alwaysOnTop: false,
      changingAlwaysOnTop: false,
      alwaysOnTopProblem: null,
      open: () => popup.focus(),
      bringBack: () => popup.close(),
      setAlwaysOnTop: async () => undefined,
    };
    const originalTitle = document.title;
    const view = render(
      <ChatWindowPortal target={popup.document.body}>
        <DetachedWindowFrame title="Dados" window={state}>
          <p>Rolagens da mesa</p>
        </DetachedWindowFrame>
      </ChatWindowPortal>,
    );
    const panel = within(popup.document.body);
    expect(popup.document.title).toBe('Dados · Lorkarium');
    expect(document.title).toBe(originalTitle);
    expect(popup.document.documentElement.style.getPropertyValue('--title-bar-height')).toBe(
      '38px',
    );
    expect(panel.getByRole('banner')).toHaveAttribute('data-app-region', 'drag');
    expect(
      within(panel.getByRole('banner')).getByRole('button', { name: 'Sempre por cima' }),
    ).toBeInTheDocument();
    expect(panel.queryByRole('checkbox', { name: 'Sempre por cima' })).not.toBeInTheDocument();
    await userEvent.click(panel.getByRole('button', { name: 'Minimizar' }));
    await userEvent.click(panel.getByRole('button', { name: 'Maximizar' }));
    act(() => controls.resize(true));
    await userEvent.click(panel.getByRole('button', { name: 'Restaurar' }));
    await userEvent.click(panel.getByRole('button', { name: 'Fechar' }));
    expect(controls.calls).toEqual(['minimize', 'toggleMaximize', 'toggleMaximize', 'close']);
    view.unmount();
    expect(popup.document.documentElement.style.getPropertyValue('--title-bar-height')).toBe('');
    popup.close();
  });

  it('drops the pin with hidePin and shows the always-on-top problem in the body', () => {
    const popup = new ChatWindowFake();
    const state: ChatWindow = {
      status: 'detached',
      closeError: null,
      portalTarget: popup.document.body,
      desktopWindow: null,
      canAlwaysOnTop: true,
      alwaysOnTop: false,
      changingAlwaysOnTop: false,
      alwaysOnTopProblem: 'Falhou',
      open: () => popup.focus(),
      bringBack: () => popup.close(),
      setAlwaysOnTop: async () => undefined,
    };
    render(
      <ChatWindowPortal target={popup.document.body}>
        <DetachedWindowFrame title="Imagem" window={state} hidePin>
          <p>Mapa</p>
        </DetachedWindowFrame>
      </ChatWindowPortal>,
    );
    const panel = within(popup.document.body);
    expect(panel.queryByRole('button', { name: 'Sempre por cima' })).not.toBeInTheDocument();
    expect(panel.getByRole('alert')).toHaveTextContent('Falhou');
    popup.close();
  });
});
