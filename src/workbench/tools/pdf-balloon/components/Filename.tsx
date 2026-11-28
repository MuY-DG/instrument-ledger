import { useLayoutEffect, useRef, useState } from 'react';
import { middleEllipsis } from '../core/text';
export function Filename({ value, fit = false }: { value: string; fit?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const context = document.createElement('canvas').getContext('2d');
    const measure = () => {
      if (!context) return;
      context.font = getComputedStyle(element).font;
      if (fit) element.style.width = `${Math.ceil(context.measureText(value).width)}px`;
      const width = element.clientWidth;
      if (context.measureText(value).width <= width) {
        setDisplay(value);
        return;
      }
      let low = 0,
        high = Array.from(value).length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (context.measureText(middleEllipsis(value, mid)).width <= width) low = mid;
        else high = mid - 1;
      }
      setDisplay(middleEllipsis(value, low));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [value, fit]);
  return (
    <span
      ref={host}
      className="filename-text"
      style={fit ? { maxWidth: '100%' } : undefined}
      title={value}
      aria-label={value}
      data-filename={value}
    >
      {display}
    </span>
  );
}
