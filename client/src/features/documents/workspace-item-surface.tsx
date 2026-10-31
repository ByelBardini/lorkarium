import { useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { PanelTopCloseIcon } from 'lucide-react';
import type { AppDependencies } from '@/app/router';
import { Button } from '@/components/ui/button';
import { ChatWindowPortal } from '@/features/chat/chat-window-portal';
import { DetachedWindowFrame } from '@/features/chat/detached-window-frame';
import { useChatWindow } from '@/features/chat/use-chat-window';
import { workspaceItemTitle, type WorkspaceItem } from '@/stores/document-workspace-store';

/** Where the item's panel is drawn right now, and the two moves its header offers. */
export type WorkspaceSurface = Readonly<{
  /** In its own window: the panel goes compact (the window's bar has the title and the X). */
  detached: boolean;
  /** In the room tab or the window (not parked off screen). */
  visible: boolean;
  /** "Abrir em outra janela"; absent while the window is open. */
  openWindow?: () => void;
  /** The panel's X; absent in the window, whose own X hands the item back to its tab. */
  close?: () => void;
}>;

export type WorkspaceItemSurfaceProps = Readonly<{
  deps: AppDependencies;
  item: WorkspaceItem;
  /** "Documento aberto em outra janela." on the tab while the window has the item. */
  detachedLabel: string;
  /** Said above the panel in the room tab only (a refused library action). */
  tabAlert?: ReactNode;
  children: (surface: WorkspaceSurface) => ReactNode;
}>;

/** Moves one workspace item's panel between its room tab (`item.target`) and its window, without
 *  mounting a second panel: the window gets the title bar with "Voltar à aba", the tab the
 *  "Trazer de volta" notice, and a refused window stays in the tab with a warning.
 *
 *  Example: `<WorkspaceItemSurface deps={deps} item={entry} detachedLabel="Ficha aberta em outra janela.">{(surface) => <SheetPanel … />}</WorkspaceItemSurface>` */
export function WorkspaceItemSurface(props: WorkspaceItemSurfaceProps): React.JSX.Element {
  const { deps, item } = props;
  const popup = useChatWindow(item.key, deps.chatWindowHost, item.kind, item.windowHandle);
  const navigate = useNavigate();
  const returnToTab = (): void => {
    deps.documentWorkspace.getState().activate(item.campaign.id, item.key);
    popup.bringBack();
    void navigate(`/campaigns/${encodeURIComponent(item.campaign.id)}/table`);
  };
  const close = useCallback(() => {
    void deps.documentWorkspace.getState().close(item.key);
  }, [deps.documentWorkspace, item.key]);
  const openWindow = useCallback(
    () => deps.documentWorkspace.getState().openWindow(item.key, deps.chatWindowHost),
    [deps.documentWorkspace, deps.chatWindowHost, item.key],
  );
  const detached = !!popup.portalTarget;
  const panel = props.children({
    detached,
    visible: !!item.target || detached,
    openWindow: popup.status === 'detached' ? undefined : openWindow,
    close: detached ? undefined : close,
  });
  if (popup.portalTarget) {
    const problem = item.closeProblem ?? popup.closeError ?? popup.alwaysOnTopProblem;
    return (
      <>
        {item.target &&
          createPortal(
            <DetachedItemNotice label={props.detachedLabel} onReturn={returnToTab} />,
            item.target,
          )}
        <ChatWindowPortal target={popup.portalTarget}>
          <DetachedWindowFrame
            title={workspaceItemTitle(item)}
            window={popup}
            flush
            actions={<ReturnToTabButton onReturn={returnToTab} />}
          >
            {problem && (
              <p role="alert" className="px-4 py-2 text-sm text-destructive-text">
                {problem}
              </p>
            )}
            {panel}
          </DetachedWindowFrame>
        </ChatWindowPortal>
      </>
    );
  }
  const blocked = item.windowBlocked || popup.status === 'blocked';
  const content = (
    <>
      {blocked && (
        <p role="alert" className="px-5 py-3 text-sm text-destructive-text">
          Não foi possível abrir a janela. Permita janelas pop-up e tente novamente.
        </p>
      )}
      {props.tabAlert}
      {panel}
    </>
  );
  return item.target ? <>{createPortal(content, item.target)}</> : <div hidden>{content}</div>;
}

function ReturnToTabButton({ onReturn }: Readonly<{ onReturn: () => void }>): React.JSX.Element {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Voltar para a aba"
      title="Voltar para a aba"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      onClick={onReturn}
    >
      <PanelTopCloseIcon aria-hidden="true" className="size-3.5" />
      Voltar à aba
    </Button>
  );
}

function DetachedItemNotice({
  label,
  onReturn,
}: Readonly<{ label: string; onReturn: () => void }>): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center gap-3 text-sm text-muted-foreground">
      {label}
      <Button variant="outline" onClick={onReturn}>
        Trazer de volta
      </Button>
    </div>
  );
}
