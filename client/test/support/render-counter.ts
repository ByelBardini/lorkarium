/** Counts the commits of a `<Profiler>` subtree: how many times the panel under it rendered.
 *
 *  Example: `<Profiler id="list" onRender={renders.onRender}>…</Profiler>; expect(renders.count).toBe(0)` */
export class RenderCounter {
  count = 0;

  readonly onRender = (): void => {
    this.count += 1;
  };
}
