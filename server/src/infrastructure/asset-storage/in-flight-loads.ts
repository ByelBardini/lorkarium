/** Single-flight per key: loads of the same key that overlap share one run of the work. Nothing
 *  is kept once the work settles, so a failure is retried by the next call.
 *
 *  Example: `await loads.run('assets/u1', () => downloadToDisk('assets/u1'))` */
export class InFlightLoads<T> {
  private readonly running = new Map<string, Promise<T>>();

  run(key: string, work: () => Promise<T>): Promise<T> {
    const current = this.running.get(key);
    if (current !== undefined) return current;
    const started = work().finally(() => this.running.delete(key));
    this.running.set(key, started);
    return started;
  }
}
