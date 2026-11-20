/** The wait between two e-mails of a notice, swapped in the specs for a fake that only records it.
 *
 *  Example: `await pace.pause(600)` */
export interface SendPacePort {
  pause(ms: number): Promise<void>;
}
