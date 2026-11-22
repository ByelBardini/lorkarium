import { isReportableClientError } from './reportable-client-error';

/** Decides, error by error, whether this page still reports it. */
export type ClientErrorGate = Readonly<{ admits: (error: unknown) => boolean }>;

/** Only real bugs, and at most `maxPerPage` of them per page load: a render loop does not spend
 *  the monthly quota. An expected failure never spends a slot.
 *
 *  Example: `createClientErrorGate({ maxPerPage: 10 }).admits(new Error('x')) // true` */
export function createClientErrorGate(options: Readonly<{ maxPerPage: number }>): ClientErrorGate {
  let reported = 0;
  return {
    admits: (error) => {
      if (!isReportableClientError(error)) return false;
      if (reported >= options.maxPerPage) return false;
      reported += 1;
      return true;
    },
  };
}
