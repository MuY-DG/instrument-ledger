import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

export function NumberField({ id, label, value, min, max, step = 1, unit, disabled, onChange, onCommit }: Props) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  const hold = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    target: HTMLButtonElement;
    pointerId: number;
  } | null>(null);
  const stopRepeat = useCallback(() => {
    const active = hold.current;
    hold.current = null;
    if (!active) return;
    clearTimeout(active.timer);
    if (active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  }, []);
  useEffect(() => {
    const visibility = () => { if (document.visibilityState === 'hidden') stopRepeat(); };
    window.addEventListener('blur', stopRepeat);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopRepeat();
      window.removeEventListener('blur', stopRepeat);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [stopRepeat]);
  useEffect(() => { if (disabled) stopRepeat(); }, [disabled, stopRepeat]);
  const unitId = useId();
  useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  const normalize = (number: number) => Math.min(max, Math.max(min,
    step === 1 ? Math.round(number) : Math.round(number * 1e6) / 1e6));
  function commit() {
    const parsed = text.trim() ? Number(text) : NaN;
    const number = normalize(Number.isFinite(parsed) ? parsed : value);
    setText(String(number));
    if (number !== value) onChange(number);
    onCommit?.(number);
  }
  function increment(direction: number, large: boolean) {
    if (disabled) return false;
    const parsed = text.trim() ? Number(text) : NaN;
    const number = normalize((Number.isFinite(parsed) ? parsed : value) + direction * step * (large ? 10 : 1));
    setText(String(number));
    onChange(number);
    onCommit?.(number);
    return direction > 0 ? number < max : number > min;
  }
  const latestIncrement = useRef(increment);
  latestIncrement.current = increment;
  function startRepeat(event: ReactPointerEvent<HTMLButtonElement>, direction: number) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    stopRepeat();
    const large = event.shiftKey;
    if (!increment(direction, large)) return;
    const active = { target: event.currentTarget, pointerId: event.pointerId, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    hold.current = active;
    active.target.setPointerCapture(active.pointerId);
    const repeat = () => {
      if (hold.current !== active) return;
      if (!latestIncrement.current(direction, large)) { stopRepeat(); return; }
      active.timer = setTimeout(repeat, 70);
    };
    active.timer = setTimeout(repeat, 350);
  }
  function moveRepeat(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!hold.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) stopRepeat();
  }
  const name = label.replace(/数值$/, '');
  const hint = `每次 ${step}${unit ?? ''}，长按连续调整，按住 Shift 每次 ${step * 10}${unit ?? ''}`;
  return <div className="numeric-field">
    <div className="numeric-field-value">
      <input id={id} type="number" aria-label={label} aria-describedby={unit ? unitId : undefined}
        min={min} max={max} step={step} value={text} disabled={disabled}
        inputMode={step === 1 ? 'numeric' : 'decimal'} title={hint}
        onFocus={() => { focused.current = true; }}
        onChange={event => {
          setText(event.target.value);
          if (Number.isFinite(event.target.valueAsNumber)) onChange(normalize(event.target.valueAsNumber));
        }}
        onBlur={() => { focused.current = false; commit(); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            increment(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey);
          } else if (event.key === 'Enter') {
            event.preventDefault(); event.currentTarget.blur();
          }
        }} />
      <div className="numeric-field-stepper">
        <button type="button" tabIndex={-1} aria-label={`增加${name}`} title={`增加：${hint}`} disabled={disabled || value >= max}
          onPointerDown={event => startRepeat(event, 1)} onPointerMove={moveRepeat}
          onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onLostPointerCapture={stopRepeat} onPointerLeave={stopRepeat}
          onClick={event => { if (event.detail === 0) increment(1, event.shiftKey); }}><ChevronUp size={10} /></button>
        <button type="button" tabIndex={-1} aria-label={`减少${name}`} title={`减少：${hint}`} disabled={disabled || value <= min}
          onPointerDown={event => startRepeat(event, -1)} onPointerMove={moveRepeat}
          onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onLostPointerCapture={stopRepeat} onPointerLeave={stopRepeat}
          onClick={event => { if (event.detail === 0) increment(-1, event.shiftKey); }}><ChevronDown size={10} /></button>
      </div>
    </div>
    {unit && <span className="numeric-field-unit" id={unitId}>{unit}</span>}
  </div>;
}
