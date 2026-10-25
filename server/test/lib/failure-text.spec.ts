import { describe, expect, it } from 'vitest';
import { failureText } from '../../src/lib/failure-text';

function refusedConnection(): Error {
  return Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' });
}

describe('failureText', () => {
  it('an error without cause is its message', () => {
    expect(failureText(new Error('no migrations at /app'))).toBe('no migrations at /app');
  });

  it('a wrapped refused connection shows the code the AggregateError carries', () => {
    const wrapped = new Error('Failed query', { cause: refusedConnection() });
    expect(failureText(wrapped)).toBe('Failed query (ECONNREFUSED)');
  });

  it('something thrown that is not an Error is turned into text', () => {
    expect(failureText('boom')).toBe('boom');
  });
});
