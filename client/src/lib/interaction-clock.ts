/** Time for what the board does on its own (a bend after standing still, the pace of the drag
 *  previews), so a test can play it by hand. `after` answers how to cancel.
 *
 *  Example: `const cancel = clock.after(2000, () => settle(clock.now()))` */
export type InteractionClock = Readonly<{
  now: () => number;
  after: (delayMs: number, run: () => void) => () => void;
}>;

/** The browser's clock. Example: `createBoardInteractionStore({ ...deps, clock: browserClock })` */
export const browserClock: InteractionClock = {
  now: () => performance.now(),
  after: (delayMs, run) => {
    const id = window.setTimeout(run, delayMs);
    return () => window.clearTimeout(id);
  },
};
