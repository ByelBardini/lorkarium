/** One ordered log several fakes write to, to prove which call came first.
 *
 *  Example: `expect(deps.journal.entries).toEqual([`close:${VHARN.id}`, 'logout'])` */
export class CallJournal {
  readonly entries: string[] = [];
}
