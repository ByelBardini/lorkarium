import { describe, expect, it } from 'vitest';
import { InFlightLoads } from '../../../src/infrastructure/asset-storage/in-flight-loads';

/** A load the spec resolves or rejects by hand, counting how often it was started. */
class ManualLoad {
  calls = 0;
  private settle: { resolve: (value: string) => void; reject: (error: Error) => void } | null =
    null;

  readonly work = (): Promise<string> => {
    this.calls += 1;
    return new Promise<string>((resolve, reject) => {
      this.settle = { resolve, reject };
    });
  };

  resolve(value: string): void {
    this.settle?.resolve(value);
  }

  reject(error: Error): void {
    this.settle?.reject(error);
  }
}

describe('InFlightLoads', () => {
  it('runs the work once for two simultaneous loads of the same key and shares the value', async () => {
    const loads = new InFlightLoads<string>();
    const load = new ManualLoad();

    const first = loads.run('k', load.work);
    const second = loads.run('k', load.work);
    load.resolve('bytes');

    await expect(Promise.all([first, second])).resolves.toStrictEqual(['bytes', 'bytes']);
    expect(load.calls).toBe(1);
  });

  it('runs one work per key when the keys differ', async () => {
    const loads = new InFlightLoads<string>();
    const load = new ManualLoad();

    const first = loads.run('a', load.work);
    load.resolve('a');
    const second = loads.run('b', load.work);
    load.resolve('b');

    await expect(Promise.all([first, second])).resolves.toStrictEqual(['a', 'b']);
    expect(load.calls).toBe(2);
  });

  it('keeps no result: a load after the first one settled starts the work again', async () => {
    const loads = new InFlightLoads<string>();
    const load = new ManualLoad();
    const first = loads.run('k', load.work);
    load.resolve('old');
    await first;

    const second = loads.run('k', load.work);
    load.resolve('new');

    await expect(second).resolves.toBe('new');
    expect(load.calls).toBe(2);
  });

  it('gives both callers the same error and lets the next call try again', async () => {
    const loads = new InFlightLoads<string>();
    const load = new ManualLoad();
    const failure = new Error('S3 GetObject failed');

    const first = loads.run('k', load.work);
    const second = loads.run('k', load.work);
    load.reject(failure);

    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    const retry = loads.run('k', load.work);
    load.resolve('bytes');
    await expect(retry).resolves.toBe('bytes');
    expect(load.calls).toBe(2);
  });
});
