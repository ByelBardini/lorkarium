import { useEffect, useRef } from 'react';
import type { ChatWindowHost } from '@/services/chat-window-host';
import { useChatWindow, type ChatWindow } from '@/features/chat/use-chat-window';

/** The shell explicitly opts into opening remotely requested image windows. Example: `imageWindowSupported(true)`. */
export function imageWindowSupported(isDesktop: boolean): boolean {
  return (
    isDesktop &&
    (window as Window & { __LORKARIUM_IMAGE_WINDOW_SUPPORTED__?: boolean })
      .__LORKARIUM_IMAGE_WINDOW_SUPPORTED__ === true
  );
}

/** Reuses the native panel; its X dismisses only the current presentation. Example: `useImagePresentationWindow(id, host, presentation?.id ?? null, supported, dismiss)`. */
export function useImagePresentationWindow(
  campaignId: string,
  host: ChatWindowHost,
  presentationId: string | null,
  enabled: boolean,
  onDismiss: () => void,
): Readonly<{ native: boolean; popup: ChatWindow; closeError: string | null }> {
  const popup = useChatWindow(campaignId, host, 'image');
  const { status, open, bringBack } = popup;
  const attempted = useRef<string | null>(null);
  const detached = useRef<string | null>(null);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (!presentationId || !enabled) {
      attempted.current = null;
      detached.current = null;
      if (status === 'detached') bringBack();
      return;
    }
    if (attempted.current === presentationId) return;
    attempted.current = presentationId;
    open();
  }, [enabled, presentationId, status, open, bringBack]);
  useEffect(() => {
    if (popup.status === 'detached') detached.current = presentationId;
    if (popup.status !== 'docked' || !detached.current || !presentationId) return;
    const closedId = detached.current;
    detached.current = null;
    if (closedId === presentationId) dismiss.current();
  }, [popup.status, presentationId]);
  return {
    native: enabled && presentationId !== null && popup.status === 'detached',
    popup,
    closeError: popup.closeError,
  };
}
