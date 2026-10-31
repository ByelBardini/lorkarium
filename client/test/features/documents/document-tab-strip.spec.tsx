import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import { DocumentTabStrip } from '@/features/documents/document-tab-strip';
import { isBlankDocumentContent } from '@/lib/document-blank';
import {
  createDocumentEditorStore,
  documentTabEditorKey,
  type DocumentEditorState,
} from '@/stores/document-editor-store';
import { DataTransferFake } from '../../support/data-transfer-fake';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import {
  DOCUMENT_ACTION_ID,
  DOCUMENT_CAMPAIGN_ID,
  DOCUMENT_ID,
  GENERAL_TAB_ID,
  ITEMS_TAB_ID,
  documentFixture,
  documentTabFixture,
  documentText,
  threeTabs,
} from '../../support/documents-fixtures';
import { InteractionClockFake } from '../../support/interaction-clock-fake';

type Viewer = 'master' | 'owner' | 'reader';
const RIGHTS: Readonly<Record<Viewer, { canEdit: boolean; canManage: boolean }>> = {
  master: { canEdit: true, canManage: true },
  owner: { canEdit: true, canManage: false },
  reader: { canEdit: false, canManage: false },
};

function TabStripHarness({ store }: Readonly<{ store: StoreApi<DocumentEditorState> }>) {
  const state = useStore(store);
  const document = state.confirmed;
  if (!document) return null;
  const isBlank = (tabId: string): boolean => {
    const key = documentTabEditorKey(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, tabId);
    const content = state.tabEditors[key]?.getState().confirmed?.content;
    return !!content && isBlankDocumentContent(content);
  };
  return (
    <DocumentTabStrip
      tabs={document.tabs}
      activeTabId={GENERAL_TAB_ID}
      canEdit={document.canEdit}
      canManage={document.canManage}
      isBlank={isBlank}
      onActivate={(tabId) => store.getState().openTab(tabId)}
      onCommand={(command) => state.runTabCommand(command)}
    />
  );
}

async function strip(viewer: Viewer, tabs = threeTabs()) {
  const api = new DocumentsApiFake();
  // The server never lists "Segredos" to a player.
  const listed = viewer === 'master' ? tabs : tabs.filter((tab) => tab.visibility !== 'masters');
  api.document = documentFixture({ ...RIGHTS[viewer], tabs: listed });
  const store = createDocumentEditorStore({
    api,
    clock: new InteractionClockFake(),
    campaignId: DOCUMENT_CAMPAIGN_ID,
    documentId: DOCUMENT_ID,
    newActionId: () => DOCUMENT_ACTION_ID,
  });
  await store.getState().load();
  render(<TabStripHarness store={store} />);
  return { api, store };
}
const tabNames = (): string[] =>
  screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label') ?? '');
async function openMenu(name: string): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: `Opções da aba ${name}` }));
  return screen.findByRole('menu');
}

describe('document tab strip', () => {
  it('"+" creates a tab and focuses its name, and Enter saves the name typed', async () => {
    const { api } = await strip('owner');
    await userEvent.click(screen.getByRole('button', { name: 'Nova aba' }));
    const name = await screen.findByRole('textbox', { name: 'Nome da aba' });
    expect(name).toHaveFocus();
    await userEvent.clear(name);
    await userEvent.type(name, 'Mapas{Enter}');
    await waitFor(() => expect(tabNames()).toEqual(['Geral', 'Itens', 'Mapas']));
    expect(api.tabCommands.map((call) => call.operation)).toEqual(['create', 'update']);
    expect(api.tabCommands[1]).toMatchObject({ input: { name: 'Mapas', expectedVersion: 1 } });
  });
  it('Escape gives up renaming without a command', async () => {
    const { api } = await strip('owner');
    await userEvent.click(
      within(await openMenu('Itens')).getByRole('menuitem', { name: 'Renomear' }),
    );
    const name = await screen.findByRole('textbox', { name: 'Nome da aba' });
    await userEvent.type(name, 'Bolsa{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Nome da aba' })).not.toBeInTheDocument();
    expect(tabNames()).toEqual(['Geral', 'Itens']);
    expect(api.tabCommands).toEqual([]);
  });
  it('dragging "Itens" onto "Geral" sends the order shown', async () => {
    const { api } = await strip('owner');
    const dataTransfer = new DataTransferFake();
    const tabOf = (name: string): HTMLElement => screen.getByRole('tab', { name }).parentElement!;
    fireEvent.dragStart(tabOf('Itens'), { dataTransfer });
    fireEvent.dragOver(tabOf('Geral'), { dataTransfer });
    fireEvent.drop(tabOf('Geral'), { dataTransfer });
    await waitFor(() => expect(tabNames()).toEqual(['Itens', 'Geral']));
    expect(api.tabCommands).toEqual([
      {
        operation: 'reorder',
        input: {
          actionId: DOCUMENT_ACTION_ID,
          expectedVersion: 0,
          tabIds: [ITEMS_TAB_ID, GENERAL_TAB_ID],
        },
      },
    ]);
  });
  it('deleting a tab with text asks first', async () => {
    const { api } = await strip('owner');
    await userEvent.click(
      within(await openMenu('Itens')).getByRole('menuitem', { name: 'Excluir' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Excluir a aba “Itens”?');
    expect(api.tabCommands).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir aba' }));
    await waitFor(() => expect(tabNames()).toEqual(['Geral']));
    expect(api.tabCommands[0]).toMatchObject({ operation: 'remove', tabId: ITEMS_TAB_ID });
  });
  it('deleting a blank tab already read goes at once', async () => {
    const { api, store } = await strip('owner');
    api.writeTab(
      documentTabFixture({ id: ITEMS_TAB_ID, name: 'Itens', content: documentText('') }),
    );
    await act(async () => {
      await store.getState().openTab(ITEMS_TAB_ID)?.getState().load();
    });
    await userEvent.click(
      within(await openMenu('Itens')).getByRole('menuitem', { name: 'Excluir' }),
    );
    await waitFor(() => expect(tabNames()).toEqual(['Geral']));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  it('the last tab has no "Excluir"', async () => {
    await strip('owner', [threeTabs()[0]!]);
    const menu = await openMenu('Geral');
    expect(within(menu).queryByRole('menuitem', { name: 'Excluir' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Renomear' })).toBeInTheDocument();
  });
  it('the owner Bia has no "Só mestres" and does not see the hidden tab', async () => {
    await strip('owner');
    expect(tabNames()).toEqual(['Geral', 'Itens']);
    const menu = await openMenu('Itens');
    expect(
      within(menu).queryByRole('menuitemcheckbox', { name: 'Só mestres' }),
    ).not.toBeInTheDocument();
  });
  it('the master sees "Segredos" marked and hides "Itens" from the players', async () => {
    const { api } = await strip('master');
    const secrets = screen.getByRole('tab', { name: 'Segredos' });
    expect(within(secrets).getByRole('img', { name: 'Só mestres' })).toBeInTheDocument();
    const menu = await openMenu('Itens');
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Só mestres' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('tab', { name: 'Itens' })).getByRole('img', { name: 'Só mestres' }),
      ).toBeInTheDocument(),
    );
    expect(api.tabCommands[0]).toMatchObject({
      operation: 'update',
      tabId: ITEMS_TAB_ID,
      input: { visibility: 'masters' },
    });
  });
  it('the reader Caio sees the tabs without "+", menus or dragging', async () => {
    await strip('reader');
    expect(tabNames()).toEqual(['Geral', 'Itens']);
    expect(screen.queryByRole('button', { name: 'Nova aba' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Opções da aba/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Itens' }).parentElement).not.toHaveAttribute(
      'draggable',
    );
  });
  it('a refused command explains itself', async () => {
    const { api } = await strip('owner');
    api.tabCommandResult = { ok: false, failure: { kind: 'tab_limit' } };
    await userEvent.click(screen.getByRole('button', { name: 'Nova aba' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no máximo 200 abas');
    expect(screen.queryByRole('textbox', { name: 'Nome da aba' })).not.toBeInTheDocument();
  });
});
