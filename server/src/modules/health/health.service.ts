import type { HealthDao } from './health.dao';
import { HealthCheckTimeoutError } from './health.error';

export type HealthCheckResult =
  Readonly<{ status: 'ok' }> | Readonly<{ status: 'unavailable'; cause: unknown }>;

export class HealthService {
  constructor(private readonly healthDao: Pick<HealthDao, 'ping'>) {}

  /** Pings the database, giving up after `timeoutMs` so the health check never hangs with it.
   *
   *  Example: `(await service.checkHealth(2_000)).status // 'ok'` */
  async checkHealth(timeoutMs: number): Promise<HealthCheckResult> {
    try {
      await withTimeout(this.healthDao.ping(), timeoutMs);
      return { status: 'ok' };
    } catch (cause) {
      return { status: 'unavailable', cause };
    }
  }
}

async function withTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HealthCheckTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
