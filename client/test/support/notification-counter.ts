type Subscribable = Readonly<{ subscribe: (listener: () => void) => () => void }>;

/** Counts how many times a store told its subscribers it changed (what a component re-reads).
 *
 *  Example: `const notified = new NotificationCounter(store); apply(update); expect(notified.count).toBe(0)` */
export class NotificationCounter {
  count = 0;

  constructor(store: Subscribable) {
    store.subscribe(() => {
      this.count += 1;
    });
  }
}
