import { describe, expect, it } from 'vitest';
import {
  CHAT_DRAWER_DEFAULT_HEIGHT,
  CHAT_DRAWER_MIN_HEIGHT,
  clampChatDrawerHeight,
} from '@/lib/chat-drawer-height';

describe('chat drawer height', () => {
  it('a height between the minimum and 60% of the board is kept', () => {
    expect(clampChatDrawerHeight(400, 900)).toBe(400);
  });

  it('a height below the minimum grows to 180', () => {
    expect(clampChatDrawerHeight(100, 900)).toBe(180);
  });

  it('a height above 60% of the board shrinks to that ceiling', () => {
    expect(clampChatDrawerHeight(800, 900)).toBe(540);
  });

  it('on a board so low that 60% is under the minimum, the ceiling wins', () => {
    expect(clampChatDrawerHeight(300, 250)).toBe(150);
  });

  it('a fractional ceiling is rounded down to a whole pixel', () => {
    expect(clampChatDrawerHeight(900, 701)).toBe(420);
  });

  it('the default is 330 and the minimum is 180', () => {
    expect([CHAT_DRAWER_DEFAULT_HEIGHT, CHAT_DRAWER_MIN_HEIGHT]).toEqual([330, 180]);
  });
});
