import { dmSentDto } from '@lorkarium/contracts';
import { z } from 'zod';
import {
  DIRECT_HISTORY_LIMIT,
  directConversationStorageKey,
  directIndexStorageKey,
  type DirectConversation,
} from '@/lib/direct-conversations';
import type { TabStorage } from './scene-tabs-storage';

// Not a network DTO: only what this device wrote for itself, read back defensively.
const storedIndexSchema = z.array(z.string()).max(1000);
const storedConversationSchema = z.object({
  messages: z.array(dmSentDto).max(DIRECT_HISTORY_LIMIT),
  unread: z.number().int().nonnegative(),
});

function readJson(storage: TabStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function attempt(write: () => void): void {
  try {
    write();
  } catch {
    // Blocked or full storage: the conversations stay in memory for this tab.
  }
}

/** Every conversation the account kept on this device; anything unreadable is left out.
 *
 *  Example: `readDirectConversations(localStorage, me)[bia]?.messages.length` */
export function readDirectConversations(
  storage: TabStorage,
  accountId: string,
): Record<string, DirectConversation> {
  const index = storedIndexSchema.safeParse(readJson(storage, directIndexStorageKey(accountId)));
  if (!index.success) return {};
  const entries = index.data.flatMap((friendId) => {
    const key = directConversationStorageKey(accountId, friendId);
    const stored = storedConversationSchema.safeParse(readJson(storage, key));
    return stored.success ? [[friendId, { friendId, ...stored.data }] as const] : [];
  });
  return Object.fromEntries(entries);
}

/** Writes one conversation and the index of the account (`friendIds`, every one kept).
 *
 *  Example: `writeDirectConversation(localStorage, me, conversation, Object.keys(all))` */
export function writeDirectConversation(
  storage: TabStorage,
  accountId: string,
  conversation: DirectConversation,
  friendIds: readonly string[],
): void {
  const { friendId, messages, unread } = conversation;
  attempt(() => {
    storage.setItem(directIndexStorageKey(accountId), JSON.stringify(friendIds));
    const key = directConversationStorageKey(accountId, friendId);
    storage.setItem(key, JSON.stringify({ messages, unread }));
  });
}

/** Deletes one conversation and writes the index without it.
 *
 *  Example: `removeDirectConversation(localStorage, me, bia, remainingIds)` */
export function removeDirectConversation(
  storage: TabStorage,
  accountId: string,
  friendId: string,
  remainingIds: readonly string[],
): void {
  attempt(() => {
    storage.removeItem(directConversationStorageKey(accountId, friendId));
    storage.setItem(directIndexStorageKey(accountId), JSON.stringify(remainingIds));
  });
}

/** Deletes every conversation of the account and its index (sign-out).
 *
 *  Example: `removeAllDirectConversations(localStorage, me, Object.keys(all))` */
export function removeAllDirectConversations(
  storage: TabStorage,
  accountId: string,
  friendIds: readonly string[],
): void {
  const stored = storedIndexSchema.safeParse(readJson(storage, directIndexStorageKey(accountId)));
  const everyId = new Set([...friendIds, ...(stored.success ? stored.data : [])]);
  attempt(() => {
    for (const friendId of everyId) {
      storage.removeItem(directConversationStorageKey(accountId, friendId));
    }
    storage.removeItem(directIndexStorageKey(accountId));
  });
}
