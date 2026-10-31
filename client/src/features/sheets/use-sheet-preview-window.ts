import { useChatWindow, type ChatWindow } from '@/features/chat/use-chat-window';
import type { ChatWindowHost } from '@/services/chat-window-host';

const NO_WINDOWS: ChatWindowHost = { open: () => null };

/** The window of a template's preview (`?panel=sheet-preview`, one per template). Without a
 *  host it never opens, and the editor offers no button for it.
 *
 *  Example: `const previewWindow = useSheetPreviewWindow(template.id, deps.chatWindowHost)` */
export function useSheetPreviewWindow(
  templateId: string,
  host: ChatWindowHost | undefined,
): ChatWindow {
  return useChatWindow(templateId, host ?? NO_WINDOWS, 'sheet-preview');
}
