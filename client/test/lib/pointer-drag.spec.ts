import { describe, expect, it, vi } from 'vitest';
import { trackPointerDrag, type DragPoint } from '@/lib/pointer-drag';

function pointer(type: string, clientY = 0): PointerEvent {
  const event = new MouseEvent(type, { clientX: 10, clientY }) as PointerEvent;
  return event;
}

describe('trackPointerDrag', () => {
  it('captures the pointer and follows it until it is let go', () => {
    const handle = document.createElement('div');
    handle.setPointerCapture = vi.fn();
    const moves: DragPoint[] = [];
    const onEnd = vi.fn();
    expect(trackPointerDrag(handle, { button: 0, pointerId: 7 }, (m) => moves.push(m), onEnd)).toBe(
      true,
    );
    expect(handle.setPointerCapture).toHaveBeenCalledWith(7);
    handle.dispatchEvent(pointer('pointermove', 40));
    handle.dispatchEvent(pointer('pointerup'));
    handle.dispatchEvent(pointer('pointermove', 90));
    expect(moves.map((move) => move.clientY)).toEqual([40]);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('a cancelled pointer ends the drag too', () => {
    const handle = document.createElement('div');
    const onEnd = vi.fn();
    trackPointerDrag(handle, { button: 0, pointerId: 1 }, () => undefined, onEnd);
    handle.dispatchEvent(pointer('pointercancel'));
    handle.dispatchEvent(pointer('pointerup'));
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('another button starts nothing', () => {
    const handle = document.createElement('div');
    const onMove = vi.fn();
    expect(trackPointerDrag(handle, { button: 2, pointerId: 1 }, onMove, vi.fn())).toBe(false);
    handle.dispatchEvent(pointer('pointermove', 40));
    expect(onMove).not.toHaveBeenCalled();
  });
});
