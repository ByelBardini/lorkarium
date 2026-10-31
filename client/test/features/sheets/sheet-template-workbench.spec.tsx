import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetTemplateEditor } from '@/features/sheets/sheet-template-editor';
import { SHEET_PREVIEW_DELAY_MS } from '@/features/sheets/sheet-template-preview';
import {
  sheetEditorLayoutKey,
  storedSheetEditorLayout,
  type SheetEditorLayoutMemory,
} from '@/lib/sheet-editor-layout';
import { SHEET_PREVIEW_WINDOW_URL } from '@/services/chat-window-host';
import { authorScriptStartOf } from '@/sheet-sandbox/sheet-srcdoc';
import { createSheetTemplateDraftStore } from '@/stores/sheet-template-draft-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { ChatWindowHostFake } from '../../support/chat-window-host-fake';
import { ClipboardFake } from '../../support/clipboard-fake';
import { codeTextOf, replaceCode } from '../../support/code-editor-input';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { SheetChannelsFake } from '../../support/sheet-frame-fakes';
import { tormentaTemplate } from '../../support/sheet-template-fixtures';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';
import { StorageFake } from '../../support/storage-fake';

const AT = new Date(2026, 9, 31, 14, 5, 9);

let api: SheetTemplatesApiFake;
let channels: SheetChannelsFake;
let storage: StorageFake;
let windows: ChatWindowHostFake;
let clipboard: ClipboardFake;

beforeEach(() => {
  api = new SheetTemplatesApiFake();
  channels = new SheetChannelsFake();
  storage = new StorageFake();
  windows = new ChatWindowHostFake();
  clipboard = new ClipboardFake();
});

function memoryOf(userId: string): SheetEditorLayoutMemory {
  return storedSheetEditorLayout(storage, () => userId);
}

async function openEditor(memory: SheetEditorLayoutMemory = memoryOf('ana')) {
  const draft = createSheetTemplateDraftStore({
    api,
    campaignId: VHARN.id,
    templateId: TORMENTA_TEMPLATE_ID,
  });
  const view = render(
    <SheetTemplateEditor
      draft={draft}
      live
      createChannel={channels.create}
      layoutMemory={memory}
      windows={windows}
      clipboard={clipboard}
      now={() => AT}
    />,
  );
  await screen.findByRole('textbox', { name: 'HTML do modelo' });
  return { user: userEvent.setup(), view };
}

function divider(): HTMLElement {
  return screen.getByRole('separator', { name: 'Dividir código e prévia' });
}

describe('the divider between the code and the preview', () => {
  it('starts at 60% and moves 5% per arrow, Home and End to the bounds', async () => {
    await openEditor();
    expect(divider()).toHaveAttribute('aria-valuenow', '60');
    fireEvent.keyDown(divider(), { key: 'ArrowLeft' });
    expect(divider()).toHaveAttribute('aria-valuenow', '55');
    fireEvent.keyDown(divider(), { key: 'ArrowRight' });
    fireEvent.keyDown(divider(), { key: 'ArrowRight' });
    expect(divider()).toHaveAttribute('aria-valuenow', '65');
    fireEvent.keyDown(divider(), { key: 'End' });
    expect(divider()).toHaveAttribute('aria-valuenow', '75');
    fireEvent.keyDown(divider(), { key: 'ArrowRight' });
    expect(divider()).toHaveAttribute('aria-valuenow', '75');
    fireEvent.keyDown(divider(), { key: 'Home' });
    expect(divider()).toHaveAttribute('aria-valuemin', '25');
    expect(divider()).toHaveAttribute('aria-valuenow', '25');
  });

  it('is remembered for the same person, and not for another one', async () => {
    const { view } = await openEditor(memoryOf('ana'));
    fireEvent.keyDown(divider(), { key: 'ArrowLeft' });
    view.unmount();
    await openEditor(memoryOf('ana'));
    expect(divider()).toHaveAttribute('aria-valuenow', '55');
    expect(JSON.parse(storage.values.get(sheetEditorLayoutKey('ana')) ?? '{}')).toMatchObject({
      codeShare: 55,
    });
    expect(storage.values.has(sheetEditorLayoutKey('caio'))).toBe(false);
  });

  it('a storage that throws keeps the editor working with the default', async () => {
    storage = new StorageFake(true);
    await openEditor(memoryOf('ana'));
    fireEvent.keyDown(divider(), { key: 'ArrowLeft' });
    expect(divider()).toHaveAttribute('aria-valuenow', '55');
  });

  it('dragging follows the pointer and is remembered only when it ends', async () => {
    await openEditor();
    const row = divider().parentElement as HTMLElement;
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 1000, 600));
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 700 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 500 });
    expect(divider()).toHaveAttribute('aria-valuenow', '40');
    expect(storage.values.size).toBe(0);
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 500 });
    expect(JSON.parse(storage.values.get(sheetEditorLayoutKey('ana')) ?? '{}')).toMatchObject({
      codeShare: 40,
    });
  });
});

describe('the preview in full screen', () => {
  it('takes the whole editor, and the code stays as it was when it comes back', async () => {
    const { user } = await openEditor();
    replaceCode('HTML do modelo', '<p>Força</p>');
    await user.click(screen.getByRole('button', { name: 'Prévia em tela cheia' }));
    expect(
      screen.getByRole('tablist', { name: 'Código do modelo', hidden: true }),
    ).not.toBeVisible();
    expect(screen.queryByRole('separator', { name: 'Dividir código e prévia' })).toBeNull();
    expect(screen.getByTitle('Prévia da ficha')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sair da tela cheia' }));
    expect(screen.getByRole('tablist', { name: 'Código do modelo' })).toBeVisible();
    expect(codeTextOf('HTML do modelo')).toBe('<p>Força</p>');
  });

  it('Esc goes back to the code', async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Prévia em tela cheia' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('tablist', { name: 'Código do modelo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Prévia em tela cheia' })).toBeInTheDocument();
  });

  it('marks the editor as the owner of Esc only while in full screen', async () => {
    const { user, view } = await openEditor();
    expect(view.container.querySelector('[data-owns-escape]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Prévia em tela cheia' }));
    expect(view.container.querySelector('[data-owns-escape]')).not.toBeNull();
  });
});

// The window's page finished loading and the hook's poll saw it.
async function windowLoaded(): Promise<Document> {
  const opened = windows.last();
  opened.load();
  await waitFor(() =>
    expect(within(opened.document.body).getByTitle('Prévia da ficha')).toBeTruthy(),
  );
  return opened.document;
}

describe('the preview in its own window', () => {
  it('opens the preview page, and the editor says where the preview went', async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Abrir prévia em janela' }));
    expect(windows.calls[0]?.url).toBe(SHEET_PREVIEW_WINDOW_URL);
    expect(screen.getByText('Prévia aberta em outra janela.')).toBeInTheDocument();
    const page = await windowLoaded();
    expect(screen.queryByTitle('Prévia da ficha')).toBeNull();
    expect(page.title).toBe('Prévia · Ficha Tormenta · Lorkarium');
  });

  it('follows the draft as it is typed', async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Abrir prévia em janela' }));
    const page = await windowLoaded();
    replaceCode('HTML do modelo', '<p id="nova">Nova ficha</p>');
    await waitFor(
      () =>
        expect(within(page.body).getByTitle('Prévia da ficha')).toHaveAttribute(
          'srcdoc',
          expect.stringContaining('<p id="nova">Nova ficha</p>'),
        ),
      { timeout: SHEET_PREVIEW_DELAY_MS * 3 },
    );
  });

  it('"Voltar ao editor" closes the window and the preview comes back', async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Abrir prévia em janela' }));
    const page = await windowLoaded();
    await user.click(within(page.body).getByRole('button', { name: 'Voltar ao editor' }));
    expect(windows.last().closed).toBe(true);
    expect(screen.getByTitle('Prévia da ficha')).toBeInTheDocument();
  });

  it('without a window host, no button offers it', async () => {
    const draft = createSheetTemplateDraftStore({
      api,
      campaignId: VHARN.id,
      templateId: TORMENTA_TEMPLATE_ID,
    });
    render(<SheetTemplateEditor draft={draft} live createChannel={channels.create} />);
    await screen.findByRole('textbox', { name: 'HTML do modelo' });
    expect(screen.queryByRole('button', { name: 'Abrir prévia em janela' })).toBeNull();
  });
});

function framePosts(...messages: unknown[]): void {
  const frame = screen.getByTitle('Prévia da ficha') as HTMLIFrameElement;
  vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  fireEvent.load(frame);
  const port = channels.created.at(-1)?.port1;
  if (!port) throw new Error(`no channel was opened; channels: ${channels.created.length}`);
  act(() => {
    for (const data of messages) port.dispatchEvent(new MessageEvent('message', { data }));
  });
}

function consoleRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Console' });
}

describe('the console under the preview', () => {
  it('shows what the frame logged and counts the errors, with the line of the JS file', async () => {
    await openEditor();
    const { html, css, js } = tormentaTemplate();
    const start = authorScriptStartOf({ html, css, js });
    framePosts(
      { type: 'console', level: 'log', message: 'Força 14', at: [] },
      {
        type: 'console',
        level: 'error',
        message: 'Uncaught ReferenceError: pv is not defined',
        at: [{ line: start.line, column: start.column + 3 }],
      },
    );
    const lines = within(consoleRegion()).getAllByRole('listitem');
    expect(lines.map((line) => line.textContent)).toEqual([
      'Log14:05:09Força 14',
      'Erro14:05:09Uncaught ReferenceError: pv is not defined(linha 1, coluna 3 do JS)',
    ]);
    expect(within(consoleRegion()).getByLabelText('Erros no console')).toHaveTextContent('1 erro');
  });

  it('closed, it still shows the count, and the choice is remembered', async () => {
    const { user, view } = await openEditor();
    framePosts({ type: 'console', level: 'error', message: 'x', at: [] });
    await user.click(within(consoleRegion()).getByRole('button', { name: 'Console' }));
    expect(within(consoleRegion()).queryByRole('log')).toBeNull();
    expect(within(consoleRegion()).getByLabelText('Erros no console')).toHaveTextContent('1 erro');
    view.unmount();
    await openEditor();
    expect(within(consoleRegion()).getByRole('button', { name: 'Console' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('the edge above it sets its height: up taller, down shorter, Home and End the bounds', async () => {
    await openEditor();
    const edge = screen.getByRole('separator', { name: 'Altura do console' });
    expect(edge).toHaveAttribute('aria-valuenow', '192');
    fireEvent.keyDown(edge, { key: 'ArrowUp' });
    expect(edge).toHaveAttribute('aria-valuenow', '216');
    fireEvent.keyDown(edge, { key: 'ArrowDown' });
    fireEvent.keyDown(edge, { key: 'ArrowDown' });
    expect(edge).toHaveAttribute('aria-valuenow', '168');
    fireEvent.keyDown(edge, { key: 'Home' });
    expect(edge).toHaveAttribute('aria-valuenow', '480');
    fireEvent.keyDown(edge, { key: 'End' });
    expect(edge).toHaveAttribute('aria-valuenow', '96');
  });

  it('dragging the edge up grows the console, remembered only when the drag ends', async () => {
    const { view } = await openEditor();
    const edge = screen.getByRole('separator', { name: 'Altura do console' });
    fireEvent.pointerDown(edge, { button: 0, pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(edge, { pointerId: 1, clientY: 400 });
    expect(edge).toHaveAttribute('aria-valuenow', '292');
    expect(storage.values.size).toBe(0);
    fireEvent.pointerUp(edge, { pointerId: 1, clientY: 400 });
    view.unmount();
    await openEditor();
    expect(screen.getByRole('separator', { name: 'Altura do console' })).toHaveAttribute(
      'aria-valuenow',
      '292',
    );
  });

  it('closed, the console has no height edge', async () => {
    const { user } = await openEditor();
    await user.click(within(consoleRegion()).getByRole('button', { name: 'Console' }));
    expect(screen.queryByRole('separator', { name: 'Altura do console' })).toBeNull();
  });

  it('"Rodar de novo" is a new frame: the old lines go away', async () => {
    const { user } = await openEditor();
    framePosts({ type: 'console', level: 'error', message: 'velho', at: [] });
    await user.click(screen.getByRole('button', { name: 'Rodar de novo' }));
    expect(within(consoleRegion()).queryByText('velho')).toBeNull();
    expect(within(consoleRegion()).getByLabelText('Erros no console')).toHaveTextContent(
      'Sem erros',
    );
  });
});

describe('the API tab', () => {
  it('copies the documentation through the clipboard of the editor', async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole('tab', { name: 'API' }));
    await user.click(screen.getByRole('button', { name: 'Copiar documentação' }));
    expect(await screen.findByText('Copiado')).toBeInTheDocument();
    expect(clipboard.copied[0]).toMatch(/^# Fichas do Lorkarium/);
  });
});
