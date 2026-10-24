import { describe, expect, it } from 'vitest';
import { CampaignCommandQueue } from '../../src/realtime/campaign-command-queue';

/** A promise the spec settles by hand, to hold a command in the middle of its work. */
class HeldWork<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error: Error) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

async function settled(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
}

describe('CampaignCommandQueue', () => {
  it('in the same table the second command starts only when the first ended, in arrival order', async () => {
    const queue = new CampaignCommandQueue();
    const started: string[] = [];
    const first = new HeldWork<string>();
    const one = queue.run('vharn', () => {
      started.push('one');
      return first.promise;
    });
    const two = queue.run('vharn', async () => {
      started.push('two');
      return 'second';
    });
    await settled();
    expect(started).toEqual(['one']);
    first.resolve('first');
    expect(await Promise.all([one, two])).toEqual(['first', 'second']);
    expect(started).toEqual(['one', 'two']);
  });

  it('commands of different tables run side by side', async () => {
    const queue = new CampaignCommandQueue();
    const started: string[] = [];
    const vharn = new HeldWork<void>();
    void queue.run('vharn', () => {
      started.push('vharn');
      return vharn.promise;
    });
    const quelm = queue.run('quelm', async () => {
      started.push('quelm');
      return 'quelm done';
    });
    expect(await quelm).toBe('quelm done');
    expect(started).toEqual(['vharn', 'quelm']);
    vharn.resolve();
  });

  it('when the first fails the second still runs, and only who asked for the first gets the failure', async () => {
    const queue = new CampaignCommandQueue();
    const failing = queue.run('vharn', async () => {
      throw new Error('scene lock timed out on vharn');
    });
    const next = queue.run('vharn', async () => 'ran after the failure');
    await expect(failing).rejects.toThrow('scene lock timed out on vharn');
    expect(await next).toBe('ran after the failure');
  });

  it('an idle table leaves no entry behind', async () => {
    const queue = new CampaignCommandQueue();
    await Promise.all([queue.run('vharn', async () => 1), queue.run('vharn', async () => 2)]);
    await queue
      .run('quelm', async () => {
        throw new Error('refused');
      })
      .catch(() => undefined);
    await settled();
    expect(queue.busyTables()).toBe(0);
  });
});
