import {
  ChatAttentionTracker,
  type ChatAttentionView,
  type TaskbarCommand,
} from '@/lib/chat-attention';
import type { TaskbarAttention } from '@/services/taskbar-attention';

/** The slice of a browser window the watch reads: whether it is in front, and when that changes. */
export type FocusWindow = Readonly<{
  closed?: boolean;
  document: Readonly<{ hasFocus: () => boolean }>;
  addEventListener: (type: 'focus' | 'blur', listener: () => void) => void;
  removeEventListener: (type: 'focus' | 'blur', listener: () => void) => void;
}>;

/** Lights the taskbar button for chat messages the person cannot see (see
 *  `ChatAttentionTracker`): the shell reports each message, the room reports itself while on
 *  screen with its detached chat window, if any. */
export interface ChatAttention {
  /** A message from someone else reached this table's chat. */
  messageArrived(campaignId: string): void;
  /** The table's room is on screen, its chat in `chatWindow` when detached; returns its leave. */
  showRoom(campaignId: string, chatWindow: FocusWindow | null): () => void;
  /** Only these tables are still open. */
  keepOnly(openCampaignIds: ReadonlySet<string>): void;
}

type ShownRoom = Readonly<{ campaignId: string; chatWindow: FocusWindow | null }>;

/** The app's `ChatAttention`: "in front" is the main window or the room's detached chat window
 *  having the focus, read after the focus settles (`defer`), since leaving one window for the
 *  other blurs the first before the second is focused.
 *
 *  Example: `new ChatAttentionWatch(new TauriTaskbarAttention(), window)` */
export class ChatAttentionWatch implements ChatAttention {
  private readonly tracker = new ChatAttentionTracker();
  private readonly taskbar: TaskbarAttention;
  private readonly main: FocusWindow;
  private readonly defer: (run: () => void) => void;
  private room: ShownRoom | null = null;

  constructor(
    taskbar: TaskbarAttention,
    main: FocusWindow,
    defer: (run: () => void) => void = (run) => void setTimeout(run, 0),
  ) {
    this.taskbar = taskbar;
    this.main = main;
    this.defer = defer;
    listenToFocus(main, this.focusMoved);
  }

  messageArrived(campaignId: string): void {
    this.send(this.tracker.messageArrived(campaignId, this.view()));
  }

  showRoom(campaignId: string, chatWindow: FocusWindow | null): () => void {
    const room: ShownRoom = { campaignId, chatWindow };
    this.room = room;
    if (chatWindow) listenToFocus(chatWindow, this.focusMoved);
    this.send(this.tracker.viewChanged(this.view()));
    return () => {
      if (chatWindow) stopListeningToFocus(chatWindow, this.focusMoved);
      if (this.room === room) this.room = null;
    };
  }

  keepOnly(openCampaignIds: ReadonlySet<string>): void {
    this.send(this.tracker.keepOnly(openCampaignIds));
  }

  private readonly focusMoved = (): void => {
    this.defer(() => this.send(this.tracker.viewChanged(this.view())));
  };

  private view(): ChatAttentionView {
    const chatWindow = this.room?.chatWindow ?? null;
    const chatInFront = chatWindow !== null && !chatWindow.closed && chatWindow.document.hasFocus();
    return {
      focused: this.main.document.hasFocus() || chatInFront,
      roomCampaignId: this.room?.campaignId ?? null,
    };
  }

  private send(command: TaskbarCommand): void {
    if (command === 'flash') this.taskbar.request();
    if (command === 'stop') this.taskbar.stop();
  }
}

function listenToFocus(target: FocusWindow, listener: () => void): void {
  target.addEventListener('focus', listener);
  target.addEventListener('blur', listener);
}

function stopListeningToFocus(target: FocusWindow, listener: () => void): void {
  target.removeEventListener('focus', listener);
  target.removeEventListener('blur', listener);
}
