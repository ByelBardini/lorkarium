import type { ApiErrorDto } from '@lorkarium/contracts';
import type { ZodError } from 'zod';

/** The 400 body for a request refused by its DTO.
 *  Zod messages name the path and the rule, never the received value (a password stays out).
 *
 *  Example: `reply.code(400).send(invalidBodyError(error)) // { code: 'INVALID_BODY', message: 'name: …' }` */
export function invalidBodyError(error: ZodError): ApiErrorDto {
  const problems = error.issues.map(
    (issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`,
  );
  return { code: 'INVALID_BODY', message: problems.join('; ') };
}
