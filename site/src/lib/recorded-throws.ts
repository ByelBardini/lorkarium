import { diceThrowDto } from '@lorkarium/contracts';
import { z } from 'zod';

const EXPECTED_SHAPE = 'expected a non-empty array of { throw, values }';

const recordedThrowSchema = z
  .strictObject({
    throw: diceThrowDto,
    values: z.array(z.number().int().nonnegative()),
  })
  .superRefine((recorded, context) => {
    const models = recorded.throw.models.length;
    if (recorded.values.length === models) return;
    context.addIssue({
      code: 'custom',
      path: ['values'],
      message: `${recorded.values.length} values for ${models} models; expected one value per model`,
    });
  });

/** A throw recorded by the server's real physics (`pnpm --filter @lorkarium/server dice:record`)
 *  and the face each model stopped on, in the order of `throw.models`. */
export type RecordedThrow = z.infer<typeof recordedThrowSchema>;

/**
 * The recorded throws of `src/assets/dice/throws.json`, checked against the dice contract; a bad
 * item stops the build naming its index and field, so a visitor never gets a broken throw.
 * Example: `recordedThrowsOf(throwsJson)[0].values // [17]`
 */
export function recordedThrowsOf(json: unknown): RecordedThrow[] {
  if (!Array.isArray(json)) {
    throw new Error(`Recorded throws are ${typeof json}: ${EXPECTED_SHAPE}.`);
  }
  if (json.length === 0) throw new Error(`Recorded throws are an empty array: ${EXPECTED_SHAPE}.`);
  return json.map(recordedThrowAt);
}

function recordedThrowAt(item: unknown, index: number): RecordedThrow {
  const parsed = recordedThrowSchema.safeParse(item);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path.join('.') ?? '';
  throw new Error(
    `Recorded throw ${index} is invalid at ${field}: ${issue?.message ?? 'unknown'}.`,
  );
}
