import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, onTestFinished } from 'vitest';
import { testDependencies } from '../../support/app-dependencies';
import { openLibrary } from '../../support/library-harness';
import { vharnLibrary } from '../../support/library-fixtures';
import {
  documentFixture,
  documentTabFixture,
  documentText,
  GENERAL_TAB_ID,
  ITEMS_TAB_ID,
  threeTabs,
} from '../../support/documents-fixtures';
import { VHARN } from '../../support/campaigns-api-fake';
import { ChatWindowHostFake } from '../../support/chat-window-host-fake';

async function openDocument(changes: Parameters<typeof documentFixture>[0] = {}) {
  const deps = testDependencies();
  deps.documentsApi.document = documentFixture(changes);
  deps.libraryApi.answer('list', {
    ok: true,
    value: vharnLibrary({ documents: [deps.documentsApi.document] }),
  });
  const room = await openLibrary(deps);
  await userEvent.click(screen.getByRole('treeitem', { name: 'Carta' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Expandir documento' }));
  await screen.findByRole('textbox', { name: 'Nome do documento' });
  await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
  return { deps, ...room };
}
// jsdom's Range has no layout, and ProseMirror scrolls an inserted image into view.
class RangeLayoutStub {
  install(): void {
    Object.assign(Range.prototype, {
      getClientRects: () => [],
      getBoundingClientRect: () => new DOMRect(),
    });
  }
  remove(): void {
    const range = Range.prototype as Partial<Range>;
    delete range.getClientRects;
    delete range.getBoundingClientRect;
  }
}
describe('authorized document panel', () => {
  it('keeps a blocked preview popup available in the room tab with a clear retry message', async () => {
    const deps = testDependencies();
    deps.chatWindowHost = new ChatWindowHostFake(true);
    deps.documentsApi.document = documentFixture();
    deps.libraryApi.answer('list', {
      ok: true,
      value: vharnLibrary({ documents: [deps.documentsApi.document] }),
    });
    const { router } = await openLibrary(deps);
    await userEvent.click(screen.getByRole('treeitem', { name: 'Carta' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Abrir documento em outra janela' }),
    );
    await screen.findByRole('textbox', { name: 'Nome do documento' });
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`);
    expect(screen.getByRole('alert')).toHaveTextContent('Permita janelas pop-up');
    expect(await screen.findByRole('tab', { name: 'Carta' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(deps.documentWorkspace.getState().entries).toHaveLength(1);
  });
  it('closes its document tab and returns to the campaign table', async () => {
    const { deps, router } = await openDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar documento' }));
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe(`/campaigns/${VHARN.id}/table`);
    expect(deps.documentWorkspace.getState().entries).toEqual([]);
  });
  it('lets an owner edit the title without master controls', async () => {
    const { deps } = await openDocument({ canManage: false, ownerIds: undefined });
    expect(screen.queryByText('Visível para todos na mesa')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir documento' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome do documento' }), {
      target: { value: 'Carta revista' },
    });
    await act(async () => {
      deps.interactionClock.advance(1000);
    });
    expect(deps.documentsApi.saves[0]?.name).toBe('Carta revista');
  });
  it('renders a public reader without an editing toolbar', async () => {
    await openDocument({
      canManage: false,
      canEdit: false,
      visibility: 'public',
      ownerIds: undefined,
    });
    expect(screen.getByRole('textbox', { name: 'Nome do documento' })).toBeDisabled();
    await screen.findByRole('document', { name: 'Conteúdo do documento' });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
  it('unmounts private content and images when invalidation revokes reading', async () => {
    const { deps, table } = await openDocument();
    await screen.findByRole('textbox', { name: 'Conteúdo do documento' });
    deps.documentsApi.detailResult = { ok: false, failure: { kind: 'not_found' } };
    await act(async () => {
      table.tabs.setState({ libraryRevision: 1 });
    });
    await waitFor(() => expect(deps.documentWorkspace.getState().entries).toEqual([]));
    expect(
      screen.queryByRole('textbox', { name: 'Conteúdo do documento' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).not.toBeInTheDocument();
  });
  it('asks whether to keep editing or discard when closing an offline draft', async () => {
    const { deps } = await openDocument();
    deps.documentsApi.saveResult = { ok: false, failure: { kind: 'offline' } };
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome do documento' }), {
      target: { value: 'Rascunho offline' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Fechar documento' }));
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByRole('textbox', { name: 'Nome do documento' })).toHaveValue(
      'Rascunho offline',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fechar documento' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar alterações' }));
    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: 'Carta' })).not.toBeInTheDocument(),
    );
  });
  it('each tab shows its own body and the workspace remembers the tab shown', async () => {
    const deps = testDependencies();
    deps.documentsApi.document = documentFixture({ tabs: threeTabs().slice(0, 2) });
    deps.documentsApi.writeTab(
      documentTabFixture({ id: ITEMS_TAB_ID, name: 'Itens', content: documentText('Espada') }),
    );
    deps.libraryApi.answer('list', {
      ok: true,
      value: vharnLibrary({ documents: [deps.documentsApi.document] }),
    });
    await openLibrary(deps);
    await userEvent.click(screen.getByRole('treeitem', { name: 'Carta' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Expandir documento' }));
    const tabs = await screen.findByRole('tablist', { name: 'Abas do documento' });
    expect(await screen.findByRole('textbox', { name: 'Conteúdo do documento' })).toHaveTextContent(
      'A',
    );
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Itens' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Conteúdo do documento' })).toHaveTextContent(
        'Espada',
      ),
    );
    expect(within(tabs).getByRole('tab', { name: 'Itens' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const [entry] = deps.documentWorkspace.getState().entries;
    expect(deps.documentWorkspace.getState().activeTabByDocument[entry!.key]).toBe(ITEMS_TAB_ID);
  });
  it('sends an image to the tab shown, and to the new tab after switching', async () => {
    const layout = new RangeLayoutStub();
    layout.install();
    onTestFinished(() => layout.remove());
    const { deps } = await openDocument({ tabs: threeTabs().slice(0, 2) });
    deps.documentsApi.imageResult = {
      ok: true,
      value: {
        id: '10000000-0000-4000-8000-000000000010',
        width: 8,
        height: 4,
        mimeType: 'image/png',
      },
    };
    const tabs = screen.getByRole('tablist', { name: 'Abas do documento' });
    const sendImage = async (): Promise<void> => {
      await userEvent.click(await screen.findByRole('button', { name: 'Inserir imagem' }));
      const file = new File(['png'], 'carta.png', { type: 'image/png' });
      await userEvent.upload(await screen.findByLabelText('Arquivo de imagem'), file);
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Inserir imagem no documento' })).toBeNull(),
      );
    };
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Itens' }));
    await sendImage();
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Geral' }));
    await sendImage();
    expect(deps.documentsApi.imageRequests.map((request) => request.tabId)).toEqual([
      ITEMS_TAB_ID,
      GENERAL_TAB_ID,
    ]);
  });
});
