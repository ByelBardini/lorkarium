/** The events of a board canvas, without a GPU: `loseContext()` fires `webglcontextlost` as the
 *  browser does (cancelable) and hands the event back to check `defaultPrevented`.
 *
 *  Example: `const canvas = new CanvasEventsFake(); expect(canvas.loseContext().defaultPrevented).toBe(true)` */
export class CanvasEventsFake extends EventTarget {
  loseContext(): Event {
    const event = new Event('webglcontextlost', { cancelable: true });
    this.dispatchEvent(event);
    return event;
  }
}
