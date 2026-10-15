import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { invalidBodyError } from '../../src/lib/invalid-body';

const body = z.strictObject({ name: z.string().min(1), secret: z.string().min(8) });

function zodErrorOf(input: unknown): z.ZodError {
  const result = body.safeParse(input);
  if (result.success) throw new Error(`expected ${JSON.stringify(input)} to be refused`);
  return result.error;
}

describe('invalidBodyError', () => {
  it('names every refused path with its rule under INVALID_BODY', () => {
    const error = invalidBodyError(zodErrorOf({ name: '', secret: 'x' }));
    expect(error.code).toBe('INVALID_BODY');
    expect(error.message).toMatch(/^name: .+; secret: .+$/);
  });

  it('calls a refusal of the whole body "body"', () => {
    expect(invalidBodyError(zodErrorOf('not an object')).message).toMatch(/^body: /);
  });

  it('never echoes the value received', () => {
    expect(invalidBodyError(zodErrorOf({ name: 'Ana', secret: 'short' })).message).not.toContain(
      'short',
    );
  });
});
