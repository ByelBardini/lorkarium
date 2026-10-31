import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { moveFocusAlongTabs } from '@/lib/tab-focus';

function strip(): void {
  render(
    <div role="tablist" onKeyDown={moveFocusAlongTabs}>
      <button role="tab">Geral</button>
      <button>Fechar</button>
      <button role="tab">Itens</button>
    </div>,
  );
}
describe('roving focus along the tabs', () => {
  it('ArrowRight skips what is not a tab and reaches the next tab', () => {
    strip();
    screen.getByRole('tab', { name: 'Geral' }).focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Itens' })).toHaveFocus();
  });
  it('ArrowLeft on the first tab wraps to the last', () => {
    strip();
    screen.getByRole('tab', { name: 'Geral' }).focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Itens' })).toHaveFocus();
  });
  it('other keys leave the focus where it is', () => {
    strip();
    screen.getByRole('tab', { name: 'Geral' }).focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Enter' });
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveFocus();
  });
});
