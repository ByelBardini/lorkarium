import { useLayoutEffect, useState, type RefObject } from 'react';

/** The current inner width of an element, followed with a `ResizeObserver`; 0 before the first
 *  layout.
 *
 *  Example: `const width = useElementWidth(stripRef)` */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
