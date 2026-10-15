export class HealthCheckTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`the database did not answer the health check within ${timeoutMs} ms`);
    this.name = 'HealthCheckTimeoutError';
  }
}
