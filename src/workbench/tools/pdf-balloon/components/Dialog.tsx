import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  title,
  onClose,
  children,
  className = '',
  initialFocus,
  descriptionId,
  closeDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  initialFocus?: string;
  descriptionId?: string;
  closeDisabled?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = dialog.current;
    const first = el?.querySelector<HTMLElement>(initialFocus ?? 'input,select,button');
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close.current();
      }
      if (e.key !== 'Tab' || !el) return;
      const nodes = [
        ...el.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"],summary',
        ),
      ].filter((node) => node.getClientRects().length > 0);
      if (!nodes.length) return;
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0].focus();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      previous?.focus();
    };
  }, [initialFocus]);
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog ${className}`}
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={descriptionId}
        aria-busy={closeDisabled || undefined}
      >
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="关闭对话框" onClick={onClose} disabled={closeDisabled}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
