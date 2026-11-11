type Subscribable = { subscribe: (listener: () => void) => () => void };

/** Counts how many listeners a store holds right now: wraps its `subscribe` so each new
 *  subscription adds one and its unsubscribe takes it back.
 *
 *  Example: `const listeners = new SubscriptionCounter(table.board); render(…); expect(listeners.live).toBe(1)` */
export class SubscriptionCounter {
  live = 0;

  constructor(store: Subscribable) {
    const subscribe = store.subscribe.bind(store);
    store.subscribe = (listener) => {
      this.live += 1;
      const unsubscribe = subscribe(listener);
      return () => {
        this.live -= 1;
        unsubscribe();
      };
    };
  }
}
