import { PLAN_LIMITS } from '@lorkarium/contracts';
import { act, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { describe, expect, it } from 'vitest';
import { DocumentTabBody } from '@/features/documents/document-tab-body';
import { createDocumentEditorStore } from '@/stores/document-editor-store';
import { ClipboardFake } from '../../support/clipboard-fake';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import {
  DOCUMENT_ACTION_ID,
  DOCUMENT_CAMPAIGN_ID,
  DOCUMENT_ID,
  GENERAL_TAB_ID,
  documentTabFixture,
  documentText,
} from '../../support/documents-fixtures';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { vharnLibrary } from '../../support/library-fixtures';
import { RenderCounter } from '../../support/render-counter';
import { onTablePlan } from '../../support/table-plan';

async function generalTabBody() {
  const api = new DocumentsApiFake();
  const document = createDocumentEditorStore({
    api,
    clock: new InteractionClockFake(),
    campaignId: DOCUMENT_CAMPAIGN_ID,
    documentId: DOCUMENT_ID,
    newActionId: () => DOCUMENT_ACTION_ID,
  });
  await document.getState().load();
  const editor = document.getState().openTab(GENERAL_TAB_ID)!;
  await editor.getState().load();
  const renders = new RenderCounter();
  render(
    <Profiler id="tab-body" onRender={renders.onRender}>
      <DocumentTabBody
        editor={editor}
        api={api}
        campaignId={DOCUMENT_CAMPAIGN_ID}
        documentId={DOCUMENT_ID}
        tabId={GENERAL_TAB_ID}
        library={vharnLibrary()}
        clipboard={new ClipboardFake()}
        canEdit
        onConfirmReload={() => {}}
      />
    </Profiler>,
  );
  await screen.findByRole('textbox', { name: 'Conteúdo do documento' });
  renders.count = 0;
  return { editor, renders };
}

describe('DocumentTabBody renders only with what it shows', () => {
  it('a store write that changes none of draft, confirmed, status or dirty renders nothing', async () => {
    const { editor, renders } = await generalTabBody();

    act(() => editor.setState({ status: editor.getState().status }));

    expect(renders.count).toBe(0);
  });

  it('a new draft renders the body again', async () => {
    const { editor, renders } = await generalTabBody();

    act(() => editor.getState().edit({ content: documentText('Mapa') }));

    expect(renders.count).toBeGreaterThan(0);
  });
});

async function lockedGeneralTab(planLocked: boolean): Promise<void> {
  const api = new DocumentsApiFake();
  api.writeTab(documentTabFixture({ planLocked, content: documentText('Rota da caravana') }));
  const document = createDocumentEditorStore({
    api,
    clock: new InteractionClockFake(),
    campaignId: DOCUMENT_CAMPAIGN_ID,
    documentId: DOCUMENT_ID,
    newActionId: () => DOCUMENT_ACTION_ID,
  });
  await document.getState().load();
  const editor = document.getState().openTab(GENERAL_TAB_ID)!;
  await editor.getState().load();
  render(
    onTablePlan(
      PLAN_LIMITS.free,
      <DocumentTabBody
        editor={editor}
        api={api}
        campaignId={DOCUMENT_CAMPAIGN_ID}
        documentId={DOCUMENT_ID}
        tabId={GENERAL_TAB_ID}
        library={vharnLibrary()}
        clipboard={new ClipboardFake()}
        canEdit
        onConfirmReload={() => {}}
      />,
    ),
  );
}

describe('DocumentTabBody of a tab past the plan ceiling', () => {
  it('a planLocked tab opens its text read only, with the lock and the sentence', async () => {
    await lockedGeneralTab(true);
    const text = await screen.findByRole('document', { name: 'Conteúdo do documento' });
    expect(text).toHaveAttribute('contenteditable', 'false');
    expect(text).toHaveTextContent('Rota da caravana');
    expect(screen.getByRole('img', { name: 'Só leitura' })).toBeVisible();
    expect(
      screen.getByText(/^Esta aba passou do limite do plano Grátis \(3\) e está só leitura/),
    ).toBeVisible();
  });

  it('without planLocked the text stays editable and no lock shows', async () => {
    await lockedGeneralTab(false);
    expect(await screen.findByRole('textbox', { name: 'Conteúdo do documento' })).toHaveAttribute(
      'contenteditable',
      'true',
    );
    expect(screen.queryByRole('img', { name: 'Só leitura' })).toBeNull();
  });
});
