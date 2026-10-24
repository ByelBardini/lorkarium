import type { BoardPingedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { createPingFeed } from '@/stores/ping-feed';
import { boardPinged } from '../support/table-session-fixtures';

describe('createPingFeed', () => {
  it('each push reaches the subscriber once, in order', () => {
    const feed = createPingFeed();
    const heard: BoardPingedDto[] = [];
    feed.subscribe((ping) => heard.push(ping));

    feed.push(boardPinged({ x: 1 }));
    feed.push(boardPinged({ x: 2 }));

    expect(heard.map(({ x }) => x)).toEqual([1, 2]);
  });

  it('a subscriber that left hears nothing more, while the others still do', () => {
    const feed = createPingFeed();
    const [gone, stays]: [number[], number[]] = [[], []];
    const leave = feed.subscribe((ping) => gone.push(ping.x));
    feed.subscribe((ping) => stays.push(ping.x));

    leave();
    feed.push(boardPinged({ x: 3 }));

    expect([gone, stays]).toEqual([[], [3]]);
  });

  it('a ping pushed with no subscriber is not kept for a later one', () => {
    const feed = createPingFeed();
    feed.push(boardPinged());
    const heard: BoardPingedDto[] = [];

    feed.subscribe((ping) => heard.push(ping));

    expect(heard).toEqual([]);
  });
});
