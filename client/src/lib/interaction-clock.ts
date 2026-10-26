/** Time for what the board does on its own (a bend after standing still, the pace of the drag
 *  previews), so a test can play it by hand. `after` answers how to cancel.
 *
 *  Example: `const cancel = clock.after(2000, () => settle(clock.now()))` */
export type InteractionClock = Readonly<{
  now: () => number;
  after: (delayMs: number, run: () => void) => () => void;
}>;

/** The browser's wall clock (`Date.now`): for times that must survive an F5, like the moment a
 *  roll of the dice history reveals.
 *
 *  Example: `createOpenTablesStore({ ...deps, wallClock: browserWallClock.now })` */
export const browserWallClock: InteractionClock = {
  now: () => Date.now(),
  after: (delayMs, run) => {
    const id = window.setTimeout(run, delayMs);
    return () => window.clearTimeout(id);
  },
};

/** The browser's clock. Example: `createBoardInteractionStore({ ...deps, clock: browserClock })` */
export const browserClock: InteractionClock = {
  now: () => performance.now(),
  after: (delayMs, run) => {
    const id = window.setTimeout(run, delayMs);
    return () => window.clearTimeout(id);
  },
};
