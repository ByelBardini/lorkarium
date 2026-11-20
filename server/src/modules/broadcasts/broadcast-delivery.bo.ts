// A notice that fails three cycles in a row (three minutes apart) goes to the list as a failure:
// a bounce or a dead address does not heal, and the queue must end.
export const BROADCAST_MAX_ATTEMPTS = 3;
const ERROR_MAX_LENGTH = 500;
const ADDRESS_PLACEHOLDER = 'destinatário';

export type DeliveryFailure = Readonly<{ attempts: number; gaveUp: boolean }>;

/** What one more failed attempt leaves: the new count and whether the delivery is given up.
 *
 *  Example: `failureAfter(2) // { attempts: 3, gaveUp: true }` */
export function failureAfter(previousAttempts: number): DeliveryFailure {
  const attempts = previousAttempts + 1;
  return { attempts, gaveUp: attempts >= BROADCAST_MAX_ATTEMPTS };
}

/** The error as it is kept on the delivery: without the address (an SMTP refusal often quotes
 *  it, and the queue never holds an address in clear) and short.
 *
 *  Example: `redactedFailure(new Error('550 <bia@x.com> unknown'), 'bia@x.com') // '550 <destinatário> unknown'` */
export function redactedFailure(error: unknown, address: string | null): string {
  const text = error instanceof Error ? error.message : String(error);
  const redacted = address ? replaceIgnoringCase(text, address, ADDRESS_PLACEHOLDER) : text;
  return redacted.slice(0, ERROR_MAX_LENGTH);
}

function replaceIgnoringCase(text: string, needle: string, replacement: string): string {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), replacement);
}
