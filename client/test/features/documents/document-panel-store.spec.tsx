import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentPanel } from '@/features/documents/document-panel';
import { createDocumentEditorStore } from '@/stores/document-editor-store';
import type { LibraryIntent } from '@/features/library/library-intents';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { ClipboardFake } from '../../support/clipboard-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { vharnLibrary } from '../../support/library-fixtures';

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
});
