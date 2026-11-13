import { useState, type KeyboardEvent } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { roomTabOrder } from '@/lib/room-tab-order';
import { moveFocusAlongTabs } from '@/lib/tab-focus';
import { tabMoveStepOf } from '@/lib/tab-order';
import { GROUP_TAB, type SceneTabsStore } from '@/stores/scene-tabs-store';
import { ROOM_TAB_ATTRIBUTE } from './use-room-tab-drag';

export type RoomTabMoves = Readonly<{
  /** "Carta agora é a aba 2 de 4.", for the strip's live region; empty before any move. */
  announcement: string;
  /** A tab dropped just before another, or at the end when `null` (the drag). */
  move: (key: string, before: string | null) => void;
  /** The tablist's keys: Ctrl+Shift+← / → move the focused tab, the bare arrows walk the focus. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}>;

type MovesInput = Readonly<{
  tabs: StoreApi<SceneTabsStore>;
  /** The keys that have a tab now, without the group's. */
  openKeys: readonly string[];
  nameOf: (key: string) => string;
}>;

/** Moving the room's tabs, by drag or by keyboard: the store keeps the order and a screen reader
 *  hears where the tab went. A tab moved by keyboard keeps its focus: React gives the focus back
 *  to an element it moved in the page (Chrome drops it on the move).
 *
 *  Example: `const moves = useRoomTabMoves({ tabs, openKeys, nameOf })` */
export function useRoomTabMoves({ tabs, openKeys, nameOf }: MovesInput): RoomTabMoves {
  const [announcement, setAnnouncement] = useState('');
  const reordered = (key: string, change: () => void): void => {
    const before = tabs.getState().tabOrder;
    change();
    const order = tabs.getState().tabOrder;
    if (order === before) return;
    const all = roomTabOrder({ groupKey: GROUP_TAB, order, openKeys });
    const at = all.findIndex((tab) => tab.key === key) + 1;
    setAnnouncement(`${nameOf(key)} agora é a aba ${at} de ${all.length}.`);
  };
  const move = (key: string, before: string | null): void =>
    reordered(key, () => tabs.getState().moveTab(key, before));
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    const step = tabMoveStepOf(event);
    if (step === null) return moveFocusAlongTabs(event);
    event.preventDefault();
    const key = roomKeyOf(event.target);
    if (key && key !== GROUP_TAB) reordered(key, () => tabs.getState().shiftTab(key, step));
  };
  return { announcement, move, onKeyDown };
}

function roomKeyOf(target: EventTarget): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest(`[${ROOM_TAB_ATTRIBUTE}]`)?.getAttribute(ROOM_TAB_ATTRIBUTE) ?? null;
}
