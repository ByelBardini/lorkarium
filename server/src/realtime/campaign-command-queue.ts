/** Commands that write to the same table wait their turn here, in memory, before they take a
 *  database connection: a burst at one table queues outside the pool instead of filling it
 *  with connections waiting on the scene lock, and other tables go on in parallel. The scene
 *  `FOR UPDATE` stays as the safety net. One server instance only (spec §5.7).
 *
 *  Example: `await queue.run(campaignId, () => tokens.move(userId, campaignId, command))` */
export class CampaignCommandQueue {
  // The tail of each busy table: the promise the next command waits for.
  private readonly tails = new Map<string, Promise<void>>();

  /** Runs `work` once every earlier command of `campaignId` ended (ok or not); its own result or
   *  failure goes only to this caller. */
  async run<T>(campaignId: string, work: () => Promise<T>): Promise<T> {
    const before = this.tails.get(campaignId) ?? Promise.resolve();
    const result = before.then(work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(campaignId, tail);
    void tail.then(() => this.release(campaignId, tail));
    return result;
  }

  /** How many tables have a command running or waiting (0 when the server is idle). */
  busyTables(): number {
    return this.tails.size;
  }

  // Only the last command of a table removes its entry: an idle table leaves nothing behind.
  private release(campaignId: string, tail: Promise<void>): void {
    if (this.tails.get(campaignId) === tail) this.tails.delete(campaignId);
  }
}
