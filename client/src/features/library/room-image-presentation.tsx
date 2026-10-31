import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { ChatWindowPortal } from '@/features/chat/chat-window-portal';
import { DetachedWindowFrame } from '@/features/chat/detached-window-frame';
import type { ChatWindowHost } from '@/services/chat-window-host';
import {
  useImagePresentation,
  type ImagePresentationStore,
} from '@/stores/image-presentation-store';
import { libraryFailureMessage } from './library-messages';
import { ImageViewer, ImageViewerModal } from './image-viewer';
import { imageWindowSupported, useImagePresentationWindow } from './use-image-presentation-window';

/** Lives in the room, independently of the library and grid tabs. Example: `<RoomImagePresentation store={table.imagePresentation} ... />`. */
export function RoomImagePresentation({
  store,
  host,
  isDesktop,
}: Readonly<{
  store: StoreApi<ImagePresentationStore>;
  host: ChatWindowHost;
  isDesktop: boolean;
}>): React.JSX.Element | null {
  useEffect(() => {
    store.getState().setViewing(true);
    return () => store.getState().setViewing(false);
  }, [store]);
  const state = useImagePresentation(store, (value) => value);
  const image = state.dismissed ? null : state.presentation;
  const native = useImagePresentationWindow(
    state.campaignId,
    host,
    image?.id ?? null,
    imageWindowSupported(isDesktop),
    state.dismiss,
  );
  if (!image)
    return state.failure ? (
      <div className="absolute top-16 right-4 z-40 rounded-md bg-card p-3 text-sm">
        <p role="status">{libraryFailureMessage(state.failure.kind)}</p>
        <Button variant="outline" onClick={() => void state.sync()}>
          Tentar apresentação de novo
        </Button>
      </div>
    ) : null;
  if (!native.native)
    return <ImageViewerModal key={image.id} image={image} onClose={state.dismiss} />;
  if (!native.popup.portalTarget) return null;
  return (
    <ChatWindowPortal target={native.popup.portalTarget}>
      <DetachedWindowFrame title={image.name} window={native.popup} hidePin>
        <ImageViewer key={image.id} image={image} />
        {native.closeError && <p role="alert">{native.closeError}</p>}
        <Button variant="outline" className="my-3 self-end" onClick={native.popup.bringBack}>
          Fechar imagem
        </Button>
      </DetachedWindowFrame>
    </ChatWindowPortal>
  );
}
