type Slot<T> =
  Readonly<{ kind: 'value'; value: T }> | Readonly<{ kind: 'held'; promise: Promise<T> }>;

/** The scripted part of an API fake: what each method answers when the test set it (until
 *  `clear`), or a held answer the test releases; unset methods fall back to the fake's own state.
 *
 *  Example: `answers.answer('update', { ok: false, failure: { kind: 'offline' } })` */
export class ScriptedAnswers<A extends Record<string, unknown>> {
  readonly calls: Array<{ method: keyof A; argument: unknown }> = [];
  private readonly scripted: { [M in keyof A]?: Slot<A[M]> } = {};

  answer<M extends keyof A>(method: M, result: A[M]): void {
    this.scripted[method] = { kind: 'value', value: result };
  }

  /** Keeps the next calls of `method` waiting; call the returned function to answer them. */
  hold<M extends keyof A>(method: M): (result: A[M]) => void {
    let resolve: (value: A[M]) => void = () => undefined;
    const promise = new Promise<A[M]>((settle) => {
      resolve = settle;
    });
    this.scripted[method] = { kind: 'held', promise };
    return resolve;
  }

  clear<M extends keyof A>(method: M): void {
    delete this.scripted[method];
  }

  callsOf(method: keyof A): unknown[] {
    return this.calls.filter((call) => call.method === method).map((call) => call.argument);
  }

  async reply<M extends keyof A>(
    method: M,
    argument: unknown,
    fallback: () => A[M],
  ): Promise<A[M]> {
    this.calls.push({ method, argument });
    const scripted = this.scripted[method];
    if (scripted === undefined) return fallback();
    return scripted.kind === 'held' ? scripted.promise : scripted.value;
  }
}
