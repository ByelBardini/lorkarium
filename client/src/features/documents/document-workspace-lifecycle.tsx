import { useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';
import { useSession, type SessionStore } from '@/stores/session-store';

/** Clears document bodies and windows when the signed-in account changes. Example: `<DocumentWorkspaceLifecycle sessionStore={sessionStore} workspace={workspace} />`. */
export function DocumentWorkspaceLifecycle({
  sessionStore,
  workspace,
}: Readonly<{
  sessionStore: StoreApi<SessionStore>;
  workspace: StoreApi<DocumentWorkspaceStore>;
}>): null {
  const session = useSession(sessionStore);
  const accountId = session.status === 'authenticated' ? session.user.id : null;
  const previous = useRef(accountId);
  useEffect(() => {
    if (accountId === null || previous.current !== accountId) workspace.getState().clear();
    previous.current = accountId;
  }, [accountId, workspace]);
  return null;
}
