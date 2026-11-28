import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileText, Images } from 'lucide-react';

export function ExportMenu({
  disabled,
  onPdf,
  editablePdf,
  onEditablePdfChange,
  onImages,
}: {
  disabled: boolean;
  onPdf: () => void;
  editablePdf: boolean;
  onEditablePdfChange: (editable: boolean) => void;
  onImages: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ S' : 'Ctrl S';
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onWindowBlur = () => setOpen(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  function choose(action: () => void) {
    setOpen(false);
    trigger.current?.focus();
    action();
  }
  return (
    <div
      className="export-menu"
      ref={root}
      onBlur={(e) => {
        // On macOS WKWebView / Safari, clicking a <button> inside the menu blurs the
        // focused menuitem with relatedTarget === null *before* click fires. Closing on
        // null relatedTarget unmounts the buttons before onClick can run.
        // Outside pointer clicks are handled by the document pointerdown listener above;
        // only close on blur when keyboard focus explicitly leaves the menu container.
        const next = e.relatedTarget as Node | null;
        if (next && !e.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="export-trigger"
        disabled={disabled}
        aria-label="导出"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <Download size={15} />
        <span>导出</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="export-options"
          role="menu"
          aria-label="选择导出格式"
          onKeyDown={(e) => {
            const items = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemcheckbox"]'),
            ];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            // Menu activation keys must not trigger the canvas's Space-to-pan handler.
            if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              e.stopPropagation();
              items[
                (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
              ]?.focus();
            } else if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault();
              e.stopPropagation();
              (e.key === 'Home' ? items[0] : items.at(-1))?.focus();
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') setOpen(false);
          }}
        >
          <button type="button" role="menuitem" aria-label="导出 PDF" onClick={() => choose(onPdf)}>
            <FileText size={18} />
            <span>
              PDF 文档<small>{editablePdf ? '再次导入 Folio 可继续编辑序号' : '固定序号，适合交付与打印'}</small>
            </span>
            <kbd>{shortcut}</kbd>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-label="允许二次编辑"
            aria-checked={editablePdf}
            className="export-editable-toggle"
            onClick={() => onEditablePdfChange(!editablePdf)}
          >
            <span>
              允许二次编辑<small>开启后，导出的 PDF 可在 Folio 中继续编辑</small>
            </span>
            <span className="toggle-switch" aria-hidden="true" />
          </button>
          <button type="button" role="menuitem" aria-label="导出图片" onClick={() => choose(onImages)}>
            <Images size={18} />
            <span>
              图片<small>JPEG、PNG 或 WebP</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
