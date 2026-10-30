// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createDocumentWorkspaceStore,
  documentWorkspaceKey,
} from '@/stores/document-workspace-store';
import { DocumentsApiFake } from '../support/documents-api-fake';
import { documentFixture } from '../support/documents-fixtures';
import { detailOf, VHARN, QUELM } from '../support/campaigns-api-fake';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import { ChatWindowHostFake } from '../support/chat-window-host-fake';

function setup() {
  const api = new DocumentsApiFake();
  const clock = new InteractionClockFake();
  const workspace = createDocumentWorkspaceStore({ api, clock });
  return { api, clock, workspace, campaign: detailOf(VHARN), document: documentFixture() };
}
describe('document workspace', () => {
  it('switches between document tabs and the board without discarding editor state', async () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    const editor = workspace.getState().entries[0]!.editor;
    await editor.getState().load();
    editor.getState().edit({ name: 'Tab draft' });
    workspace.getState().activate(campaign.id, null);
    expect(workspace.getState().activeByCampaign[campaign.id]).toBeNull();
    expect(editor.getState().draft?.name).toBe('Tab draft');
    workspace.getState().open({ campaign, document, focusName: true });
    expect(workspace.getState().activeByCampaign[campaign.id]).toBe(key);
    expect(workspace.getState().entries[0]?.focusName).toBe(true);
    expect(workspace.getState().entries[0]?.editor).toBe(editor);
    workspace.getState().clear();
  });
  it('closing an active document returns its campaign to the board and preserves another campaign selection', async () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    const other = workspace.getState().open({ campaign: detailOf(QUELM), document });
    await workspace.getState().close(key);
    expect(workspace.getState().activeByCampaign[campaign.id]).toBeNull();
    expect(workspace.getState().activeByCampaign[QUELM.id]).toBe(other);
    workspace.getState().clear();
  });
  it('server removal of a campaign clears only its own documents', async () => {
    const { workspace, campaign, document } = setup();
    workspace.getState().open({ campaign, document });
    workspace.getState().open({ campaign: detailOf(QUELM), document });
    workspace.getState().removeCampaign(campaign.id);
    expect(workspace.getState().entries.map((entry) => entry.campaign.id)).toEqual([QUELM.id]);
    workspace.getState().clear();
  });
  it('opening a document twice reuses one editor and its pending draft', async () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    const editor = workspace.getState().entries[0]!.editor;
    await editor.getState().load();
    editor.getState().edit({ name: 'Draft' });
    workspace.getState().open({ campaign, document });
    expect(workspace.getState().entries).toHaveLength(1);
    expect(workspace.getState().entries[0]?.editor).toBe(editor);
    expect(editor.getState().draft?.name).toBe('Draft');
    expect(key).toBe(documentWorkspaceKey(campaign.id, document.id));
    workspace.getState().clear();
  });
  it('equal document ids across campaigns receive separate editors', () => {
    const { workspace, campaign, document } = setup();
    workspace.getState().open({ campaign, document });
    workspace.getState().open({ campaign: detailOf(QUELM), document });
    expect(workspace.getState().entries).toHaveLength(2);
    expect(workspace.getState().entries[0]?.editor).not.toBe(
      workspace.getState().entries[1]?.editor,
    );
    workspace.getState().clear();
  });
  it('popup opens synchronously on the user gesture and repeated requests only focus it', () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    const host = new ChatWindowHostFake();
    workspace.getState().openWindow(key, host);
    expect(host.calls).toEqual([
      {
        url: '/chat-window.html?panel=document',
        name: `lorkarium-document-${campaign.id}:${document.id}`,
        features: 'popup,width=1000,height=800',
      },
    ]);
    workspace.getState().openWindow(key, host);
    expect(host.calls).toHaveLength(1);
    expect(host.last().focuses).toBe(1);
    workspace.getState().clear();
    expect(host.last().closed).toBe(true);
  });
  it('blocked popup retains the editor with an explicit blocked state', () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    workspace.getState().openWindow(key, new ChatWindowHostFake(true));
    expect(workspace.getState().entries[0]).toMatchObject({
      windowBlocked: true,
      windowHandle: null,
    });
    expect(workspace.getState().entries[0]?.editor).not.toBeNull();
    workspace.getState().clear();
  });
  it('offline dirty document refuses close without discard and retains draft', async () => {
    const { workspace, campaign, document, api } = setup();
    const key = workspace.getState().open({ campaign, document });
    const editor = workspace.getState().entries[0]!.editor;
    await editor.getState().load();
    api.saveResult = { ok: false, failure: { kind: 'offline' } };
    editor.getState().edit({ name: 'Keep me' });
    expect(await workspace.getState().close(key)).toBe(false);
    expect(workspace.getState().entries[0]?.editor.getState().draft?.name).toBe('Keep me');
    workspace.getState().clear();
  });
  it('access revocation removes document metadata, draft and detached window', async () => {
    const { workspace, campaign, document, api } = setup();
    const key = workspace.getState().open({ campaign, document });
    const host = new ChatWindowHostFake();
    workspace.getState().openWindow(key, host);
    const editor = workspace.getState().entries[0]!.editor;
    await editor.getState().load();
    api.detailResult = { ok: false, failure: { kind: 'not_found' } };
    await editor.getState().revalidate();
    expect(workspace.getState().entries).toEqual([]);
    expect(editor.getState().draft).toBeNull();
    expect(host.last().closed).toBe(true);
  });
});
