import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COPY_FEEDBACK_MS } from '@/features/sheets/copy-reference-button';
import { SheetApiReference } from '@/features/sheets/sheet-api-reference';
import { sheetApiReferenceMarkdown } from '@/features/sheets/sheet-api-reference-markdown';
import { ClipboardFake } from '../../support/clipboard-fake';

afterEach(() => {
  vi.useRealTimers();
});

function copyButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Copiar documentação' });
}

describe('"Copiar documentação" of the API tab', () => {
  it('puts the whole reference in Markdown on the clipboard and says "Copiado"', async () => {
    const clipboard = new ClipboardFake();
    render(<SheetApiReference clipboard={clipboard} />);
    fireEvent.click(copyButton());
    expect(await screen.findByRole('status')).toHaveTextContent('Copiado');
    expect(clipboard.copied).toEqual([sheetApiReferenceMarkdown()]);
  });

  it('a clipboard the browser refuses says so, and nothing breaks', async () => {
    render(<SheetApiReference clipboard={new ClipboardFake(true)} />);
    fireEvent.click(copyButton());
    expect(await screen.findByText('Não foi possível copiar')).toBeInTheDocument();
    expect(copyButton()).toBeEnabled();
  });

  it('"Copiado" goes away after a moment', async () => {
    vi.useFakeTimers();
    render(<SheetApiReference clipboard={new ClipboardFake()} />);
    fireEvent.click(copyButton());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Copiado');
    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_MS);
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('without a clipboard, no button is offered', () => {
    render(<SheetApiReference />);
    expect(screen.queryByRole('button', { name: 'Copiar documentação' })).toBeNull();
  });
});
