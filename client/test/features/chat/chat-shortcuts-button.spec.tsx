import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ChatShortcutsButton } from '@/features/chat/chat-shortcuts-button';

async function openHelp(atTable: boolean, canRoll: boolean): Promise<HTMLElement> {
  render(<ChatShortcutsButton atTable={atTable} canRoll={canRoll} />);
  await userEvent.click(screen.getByRole('button', { name: 'Atalhos do chat' }));
  return screen.getByRole('dialog', { name: 'Atalhos do chat' });
}

describe('ChatShortcutsButton', () => {
  it('at the Table, who plays sees the whisper and the rolls', async () => {
    const help = await openHelp(true, true);
    expect(help).toHaveTextContent('/w nome mensagem');
    expect(help).toHaveTextContent('/r 1d20+5');
    expect(help).toHaveTextContent('Digite / no campo');
  });

  it('at the Table, who only watches sees the whisper and no roll', async () => {
    const help = await openHelp(true, false);
    expect(help).toHaveTextContent('/w nome mensagem');
    expect(help).not.toHaveTextContent('/r');
  });

  it('out of the Table only Enter, Shift+Enter and @nome are listed', async () => {
    const help = await openHelp(false, true);
    expect(help).toHaveTextContent('Shift+Enter');
    expect(help).toHaveTextContent('@nome');
    expect(help).not.toHaveTextContent('/w');
    expect(help).not.toHaveTextContent('Digite /');
  });
});
