import type { ChatAttention, FocusWindow } from '@/features/chat/chat-attention-watch';
import type { TaskbarAttention } from '@/services/taskbar-attention';

/** Keeps every command sent to the taskbar button, in order. */
export class TaskbarAttentionFake implements TaskbarAttention {
  readonly commands: ('request' | 'stop')[] = [];

  request(): void {
    this.commands.push('request');
  }

  stop(): void {
    this.commands.push('stop');
  }
}

/** A window whose focus is moved by hand: `focus()`/`blur()` set it and fire the event. */
export class FocusWindowFake implements FocusWindow {
  closed = false;
  private focused: boolean;
  private readonly listeners = new Map<'focus' | 'blur', Set<() => void>>([
    ['focus', new Set()],
    ['blur', new Set()],
  ]);

  readonly document = { hasFocus: (): boolean => this.focused };

  constructor(focused = true) {
    this.focused = focused;
  }

  addEventListener(type: 'focus' | 'blur', listener: () => void): void {
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: 'focus' | 'blur', listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  focus(): void {
    this.focused = true;
    for (const listener of this.listeners.get('focus') ?? []) listener();
  }

  blur(): void {
    this.focused = false;
    for (const listener of this.listeners.get('blur') ?? []) listener();
  }

  listenerCount(): number {
    return (this.listeners.get('focus')?.size ?? 0) + (this.listeners.get('blur')?.size ?? 0);
  }
}

/** Keeps what the app reported: the messages, the rooms shown (and left) and the open tables. */
export class ChatAttentionFake implements ChatAttention {
  readonly messages: string[] = [];
  readonly rooms: { campaignId: string; chatWindow: FocusWindow | null; left: boolean }[] = [];
  readonly openSets: string[][] = [];

  messageArrived(campaignId: string): void {
    this.messages.push(campaignId);
  }

  showRoom(campaignId: string, chatWindow: FocusWindow | null): () => void {
    const room = { campaignId, chatWindow, left: false };
    this.rooms.push(room);
    return () => {
      room.left = true;
    };
  }

  keepOnly(openCampaignIds: ReadonlySet<string>): void {
    this.openSets.push([...openCampaignIds]);
  }

  /** The rooms still on screen. */
  shownRooms(): string[] {
    return this.rooms.filter((room) => !room.left).map((room) => room.campaignId);
  }
}
