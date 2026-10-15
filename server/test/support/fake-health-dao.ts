import type { HealthDao } from '../../src/modules/health/health.dao';

/** Stands in for the database ping: answers, fails with a given error, or never answers.
 *
 *  Example: `new HealthService(FakeHealthDao.failingWith(new Error('connection refused')))` */
export class FakeHealthDao implements Pick<HealthDao, 'ping'> {
  private constructor(private readonly answerPing: () => Promise<void>) {}

  static answering(): FakeHealthDao {
    return new FakeHealthDao(() => Promise.resolve());
  }

  static failingWith(error: Error): FakeHealthDao {
    return new FakeHealthDao(() => Promise.reject(error));
  }

  static hanging(): FakeHealthDao {
    return new FakeHealthDao(() => new Promise<void>(() => {}));
  }

  ping(): Promise<void> {
    return this.answerPing();
  }
}
