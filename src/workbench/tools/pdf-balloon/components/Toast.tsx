import { useEffect, useState } from 'react';
import { AlertTriangle, CircleCheck, X } from 'lucide-react';

export interface Notification {
  id: number;
  text: string;
  error: boolean;
}

export function Toast({ notification, onDismiss }: {
  notification: Notification;
  onDismiss: (id: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { id, text, error } = notification;

  useEffect(() => {
    if (leaving || hovered || focused) return;
    const timer = window.setTimeout(() => setLeaving(true), error ? 9000 : 4500);
    return () => window.clearTimeout(timer);
  }, [error, leaving, hovered, focused]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onDismiss(id), 200);
    return () => window.clearTimeout(timer);
  }, [leaving, id, onDismiss]);

  return <div className={`toast ${error ? 'error' : ''} ${leaving ? 'is-leaving' : ''}`}
    role={error ? 'alert' : 'status'} aria-atomic="true"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    {error ? <AlertTriangle size={17} aria-hidden="true" /> : <CircleCheck size={17} aria-hidden="true" />}
    <span>{text}</span>
    <button className="icon-btn" aria-label="关闭提示" onClick={() => setLeaving(true)}><X size={14} /></button>
  </div>;
}
