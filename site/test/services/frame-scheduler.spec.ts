// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { AnimationFrameScheduler } from '@/services/frame-scheduler';

describe('AnimationFrameScheduler', () => {
  it('runs the callback on the next animation frame, not right away', async () => {
    const order: string[] = [];
    const painted = new Promise<void>((resolve) =>
      new AnimationFrameScheduler().request(() => {
        order.push('frame');
        resolve();
      }),
    );
    order.push('after request');

    await painted;

    expect(order).toEqual(['after request', 'frame']);
  });
});
