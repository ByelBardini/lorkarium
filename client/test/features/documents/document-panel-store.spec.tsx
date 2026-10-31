import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DocumentPanel } from '@/features/documents/document-panel';
import { createDocumentEditorStore } from '@/stores/document-editor-store';
import type { LibraryIntent } from '@/features/library/library-intents';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { ClipboardFake } from '../../support/clipboard-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { vharnLibrary } from '../../support/library-fixtures';
import { GENERAL_TAB_ID, documentText } from '../../support/documents-fixtures';

class WorkspacePanelActions {
  intents: LibraryIntent[] = [];
  changed = (): void => {};
  submit = async (intent: LibraryIntent): Promise<void> => {
    this.intents.push(intent);
  };
}

describe('document panel workspace ownership', () => {
  it('preserves an externally owned draft and autosave when its workspace surface unmounts', async () => {
    const api = new DocumentsApiFake();
    const clock = new InteractionClockFake();
    const actions = new WorkspacePanelActions();
    const store = createDocumentEditorStore({
      api,
      campaignId: VHARN.id,
      documentId: api.document.id,
      clock,
      newActionId: () => '10000000-0000-4000-8000-000000000002',
    });
    await store.getState().load();
    store.getState().edit({ name: 'Carta pendente' });
    const view = render(
      <DocumentPanel
        campaign={detailOf(VHARN)}
        documentId={api.document.id}
        api={api}
        library={vharnLibrary()}
        live
        revision={0}
        clock={clock}
        clipboard={new ClipboardFake()}
        editorStore={store}
        submit={actions.submit}
        onChanged={actions.changed}
      />,
    );
    expect(await screen.findByRole('textbox', { name: 'Nome do documento' })).toHaveValue(
      'Carta pendente',
    );
    view.unmount();
    await act(async () => {
      clock.advance(1000);
    });
    expect(api.saves[0]?.name).toBe('Carta pendente');
    expect(store.getState().confirmed?.name).toBe('Carta pendente');
    store.getState().dispose();
  });
  it('a conflict in the tab keeps the name editable and copies the tab draft', async () => {
    const api = new DocumentsApiFake();
    const clock = new InteractionClockFake();
    const clipboard = new ClipboardFake();
    const store = createDocumentEditorStore({
      api,
      campaignId: VHARN.id,
      documentId: api.document.id,
      clock,
      newActionId: () => '10000000-0000-4000-8000-000000000002',
    });
    await store.getState().load();
    const tab = store.getState().openTab(GENERAL_TAB_ID)!;
    await tab.getState().load();
    api.tabSaveResults[GENERAL_TAB_ID] = { ok: false, failure: { kind: 'conflict' } };
    tab.getState().edit({ content: documentText('Meu texto') });
    await tab.getState().flush();
    render(
      <DocumentPanel
        campaign={detailOf(VHARN)}
        documentId={api.document.id}
        api={api}
        library={vharnLibrary()}
        live
        revision={0}
        clock={clock}
        clipboard={clipboard}
        editorStore={store}
        submit={new WorkspacePanelActions().submit}
        onChanged={() => undefined}
      />,
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Outra edição foi salva');
    expect(screen.getByRole('textbox', { name: 'Nome do documento' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Copiar meu rascunho' }));
    expect(clipboard.copied).toEqual([JSON.stringify(documentText('Meu texto'))]);
    await userEvent.click(screen.getByRole('button', { name: 'Carregar versão atual' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar alterações' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(tab.getState()).toMatchObject({ dirty: false, status: 'saved' });
    store.getState().dispose();
  });
});
