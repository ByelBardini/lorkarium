import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentWorkspaceLifecycle } from '@/features/documents/document-workspace-lifecycle';
import { testDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { documentFixture } from '../../support/documents-fixtures';

describe('document account lifecycle', () => {
  it('clears confirmed bodies and open documents immediately on logout', async () => {
    const deps = testDependencies();
    deps.sessionStore.getState().signedIn(ANA);
    deps.documentWorkspace
      .getState()
      .open({ campaign: detailOf(VHARN), document: documentFixture() });
    const editor = deps.documentWorkspace.getState().entries[0]?.editor;
    await editor?.getState().load();
    render(
      <DocumentWorkspaceLifecycle
        workspace={deps.documentWorkspace}
        sessionStore={deps.sessionStore}
      />,
    );
    expect(editor?.getState().confirmed?.name).toBe('Carta');
    act(() => deps.sessionStore.getState().signedOut());
    expect(deps.documentWorkspace.getState().entries).toEqual([]);
    expect(editor?.getState().confirmed).toBeNull();
    expect(editor?.getState().draft).toBeNull();
  });
});
