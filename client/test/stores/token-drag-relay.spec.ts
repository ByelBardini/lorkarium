import { cell, type Cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { DRAG_SEND_INTERVAL_MS, TokenDragRelay } from '@/stores/token-drag-relay';
import { InteractionClockFake } from '../support/interaction-clock-fake';

const LYRA = 'lyra';

/** Plays the server: each preview waits for `answer()`. */
class DragSendsFake {
  readonly sent: Array<Cell | null> = [];
  private answers: Array<() => void> = [];

  readonly send = (_tokenId: string, over: Cell | null): Promise<void> => {
    this.sent.push(over);
    return new Promise((resolve) => this.answers.push(resolve));
  };

  async answer(): Promise<void> {
    this.answers.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('TokenDragRelay', () => {
  let clock: InteractionClockFake;
  let sends: DragSendsFake;
  let relay: TokenDragRelay;

  beforeEach(() => {
    clock = new InteractionClockFake();
    sends = new DragSendsFake();
    relay = new TokenDragRelay(sends.send, clock);
  });

  it('the first cell goes out at once', () => {
    relay.push(LYRA, cell(2, 6));
    expect(sends.sent).toEqual([cell(2, 6)]);
  });

  it('cells while one is on its way collapse into the latest, sent after the answer', async () => {
    relay.push(LYRA, cell(2, 6));
    relay.push(LYRA, cell(3, 6));
    relay.push(LYRA, cell(4, 6));
    clock.advance(DRAG_SEND_INTERVAL_MS);
    expect(sends.sent).toEqual([cell(2, 6)]);
    await sends.answer();
    expect(sends.sent).toEqual([cell(2, 6), cell(4, 6)]);
  });

  it('never sends two within 100 ms, even with quick answers', async () => {
    relay.push(LYRA, cell(2, 6));
    await sends.answer();
    relay.push(LYRA, cell(3, 6));
    expect(sends.sent).toHaveLength(1);
    clock.advance(DRAG_SEND_INTERVAL_MS);
    expect(sends.sent).toEqual([cell(2, 6), cell(3, 6)]);
  });

  it('end sends null right away, dropping the cell that waited', async () => {
    relay.push(LYRA, cell(2, 6));
    await sends.answer();
    relay.push(LYRA, cell(3, 6));
    relay.end(LYRA);
    expect(sends.sent).toEqual([cell(2, 6), null]);
    clock.advance(DRAG_SEND_INTERVAL_MS);
    expect(sends.sent).toEqual([cell(2, 6), null]);
  });

  it('end while a preview is on its way goes out after its answer, in order', async () => {
    relay.push(LYRA, cell(2, 6));
    relay.end(LYRA);
    expect(sends.sent).toEqual([cell(2, 6)]);
    await sends.answer();
    expect(sends.sent).toEqual([cell(2, 6), null]);
  });

  it('settle drops what waits and resolves only after the preview on its way was answered', async () => {
    relay.push(LYRA, cell(2, 6));
    relay.push(LYRA, cell(3, 6));
    let settled = false;
    void relay.settle()?.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await sends.answer();
    expect(settled).toBe(true);
    expect(sends.sent).toEqual([cell(2, 6)]);
  });

  it('settle with nothing on its way answers null, so a move goes out at once', async () => {
    relay.push(LYRA, cell(2, 6));
    await sends.answer();
    expect(relay.settle()).toBeNull();
  });
});
