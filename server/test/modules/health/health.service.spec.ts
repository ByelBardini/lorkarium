import { describe, expect, it } from 'vitest';
import { HealthCheckTimeoutError } from '../../../src/modules/health/health.error';
import { HealthService } from '../../../src/modules/health/health.service';
import { FakeHealthDao } from '../../support/fake-health-dao';

const TIMEOUT_MS = 20;

describe('HealthService.checkHealth', () => {
  it('a database that answers the ping is reported ok', async () => {
    const service = new HealthService(FakeHealthDao.answering());
    expect(await service.checkHealth(TIMEOUT_MS)).toEqual({ status: 'ok' });
  });

  it('a ping rejected with connection refused is reported unavailable with that cause', async () => {
    const refused = new Error('connection refused');
    const service = new HealthService(FakeHealthDao.failingWith(refused));
    expect(await service.checkHealth(TIMEOUT_MS)).toEqual({
      status: 'unavailable',
      cause: refused,
    });
  });

  it('a ping that never answers is reported unavailable once the 20 ms timeout passes', async () => {
    const service = new HealthService(FakeHealthDao.hanging());
    const result = await service.checkHealth(TIMEOUT_MS);
    expect(result).toEqual({ status: 'unavailable', cause: new HealthCheckTimeoutError(20) });
  });
});
