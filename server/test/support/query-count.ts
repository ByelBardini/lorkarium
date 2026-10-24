import type { QueryLog } from '../../src/database/database';

/** Keeps every statement the database client sent, in order, until `reset()`.
 *
 *  Example: `queries.reset(); await send(bia, 'token:move', move); expect(queries.count).toBe(9)` */
export class CountingQueryLog implements QueryLog {
  readonly queries: string[] = [];

  logQuery(query: string): void {
    this.queries.push(query);
  }

  get count(): number {
    return this.queries.length;
  }

  /** How many of the statements match, e.g. `matching(/^begin/i)` for the transactions. */
  matching(pattern: RegExp): number {
    return this.queries.filter((query) => pattern.test(query)).length;
  }

  reset(): void {
    this.queries.length = 0;
  }
}
