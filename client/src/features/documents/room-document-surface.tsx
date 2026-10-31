import { useEffect, useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { DocumentWorkspaceStore } from '@/stores/document-workspace-store';

/** Mounts the active room tab's portal target without replacing its board. Example: <RoomDocumentSurface workspace={workspace} activeKey={key} />. */
export function RoomDocumentSurface({
  workspace,
  activeKey,
}: Readonly<{
  workspace?: StoreApi<DocumentWorkspaceStore>;
  activeKey: string | null;
}>): React.JSX.Element | null {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!workspace || !activeKey) return;
    workspace.getState().setTarget(activeKey, target.current);
    return () => workspace.getState().setTarget(activeKey, null);
  }, [workspace, activeKey]);
  return activeKey ? (
    <section
      aria-label="Documento aberto"
      ref={target}
      className="absolute inset-0 flex min-h-0 min-w-0 flex-col bg-background"
    />
  ) : null;
}
