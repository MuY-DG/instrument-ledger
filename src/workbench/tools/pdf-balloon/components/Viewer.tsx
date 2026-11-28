import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DocumentView, Marker, MarkerStyle, PdfSession, Rect, Tool } from '../types';
import { clamp, nearestPage, pageLayout, visiblePages } from '../core/geometry';
import type { PageSpacing } from '../core/geometry';
import { PageCanvas } from './PageCanvas';
import { MarkerGlyph } from './MarkerGlyph';

export interface ViewerHandle {
  focus: () => void;
  jump: (number: number) => void;
  fit: () => void;
  zoom: (factor: number) => void;
  setZoom: (scale: number) => void;
}

interface Props {
  active?: boolean;
  hostOverlayOpen?: boolean;
  session: PdfSession;
  markers: Marker[];
  selected: Set<string>;
  tool: Tool;
  style: MarkerStyle;
  nextNumber: number;
  scale: number;
  wheelZoom: boolean;
  wheelResize: boolean;
  onResize: (delta: number, group: object) => void;
  onResizeHover: (hovered: boolean) => void;
  disabled?: boolean;
  onScale: (scale: number) => void;
  onPage: (number: number) => void;
  onSelect: (ids: Set<string>) => void;
  onAdd: (page: number, x: number, y: number) => void;
  onExitMarkerMode: () => void;
  onCommit: (items: Marker[]) => void;
  onDelete: (ids: Set<string>) => void;
  onEdit: (id: string) => void;
  onFirstPaint?: (sessionId: string) => void;
  zoomMode: 'fit' | 'custom';
  pageSpacing: PageSpacing;
  onZoomMode: (mode: 'fit' | 'custom') => void;
  initialView?: DocumentView;
  onViewChange: (sessionId: string, view: DocumentView) => void;
}

interface Gesture {
  pointerId: number;
  kind: 'pan' | 'select' | 'drag' | 'place';
  x: number;
  y: number;
  moved: boolean;
  scrollLeft: number;
  scrollTop: number;
  original: Marker[];
  ids: Set<string>;
  primary?: Marker;
  offsetX?: number;
  offsetY?: number;
  additive?: boolean;
}

interface WheelGesture {
  kind: 'resize' | 'scroll' | 'zoom';
  context: readonly unknown[];
  at: number;
  group: object;
  remainder: number;
}

export const Viewer = forwardRef<ViewerHandle, Props>(function Viewer(props, ref) {
  const {
    active = true,
    hostOverlayOpen = false,
    session,
    markers,
    selected,
    tool,
    style,
    nextNumber,
    scale,
    pageSpacing,
    onScale,
    onPage,
    onSelect,
    onAdd,
    onCommit,
    onDelete,
    onEdit,
  } = props;
  const root = useRef<HTMLDivElement>(null),
    ghost = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    space = useRef(false);
  const [restoredSessionId, setRestoredSessionId] = useState<string>();
  const restoring = restoredSessionId !== session.id;
  const [view, setView] = useState({ top: 0, left: 0, width: 1000, height: 700 });
  const [selectionBox, setSelectionBox] = useState<Rect | null>(null),
    [preview, setPreview] = useState<Marker[] | null>(null),
    [panning, setPanning] = useState(false);
  const previewRef = useRef<Marker[] | null>(null),
    frame = useRef(0),
    navigationFrame = useRef(0),
    moveFrame = useRef(0);
  const latest = useRef(props);
  latest.current = props;
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const control = useRef(false);
  const wheelGesture = useRef<WheelGesture | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // React 18 compatible `inert` synchronization
  useEffect(() => {
    const el = root.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = Boolean(props.disabled);
  }, [props.disabled]);

  const selectedAt = useCallback((x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    if (element?.closest('[data-delete]')) return false;
    const marker = element?.closest<HTMLElement>('[data-marker]');
    if (
      !marker ||
      !root.current?.contains(marker) ||
      !latest.current.selected.has(marker.dataset.marker!)
    )
      return false;
    const bounds = marker.getBoundingClientRect();
    return (
      Math.hypot(x - bounds.left - bounds.width / 2, y - bounds.top - bounds.height / 2) <=
      bounds.width / 2
    );
  }, []);

  const updateResizeHover = useCallback(() => {
    const p = latest.current;
    const activeGesture = wheelGesture.current;
    const hovering =
      activeGesture && performance.now() - activeGesture.at < 200
        ? activeGesture.kind === 'resize'
        : !!pointer.current && selectedAt(pointer.current.x, pointer.current.y);
    p.onResizeHover(
      hovering &&
        p.wheelResize &&
        !p.disabled &&
        p.tool !== 'hand' &&
        !space.current &&
        !control.current &&
        !gesture.current &&
        !p.hostOverlayOpen &&
        !document.querySelector('.folio-workbench [role="dialog"]'),
    );
  }, [selectedAt]);

  const resetWheel = useCallback(() => {
    clearTimeout(wheelTimer.current);
    wheelGesture.current = null;
  }, []);

  const cancelGesture = useCallback(() => {
    const activeGesture = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(moveFrame.current);
    if (activeGesture && root.current?.hasPointerCapture(activeGesture.pointerId))
      root.current.releasePointerCapture(activeGesture.pointerId);
    setPanning(false);
    setSelectionBox(null);
    setPreview(null);
    previewRef.current = null;
    if (ghost.current) ghost.current.style.display = 'none';
    updateResizeHover();
  }, [updateResizeHover]);

  useEffect(() => {
    cancelGesture();
  }, [tool, active, cancelGesture]);

  useEffect(() => {
    updateResizeHover();
  }, [
    selected,
    markers,
    scale,
    tool,
    props.wheelResize,
    props.disabled,
    hostOverlayOpen,
    updateResizeHover,
  ]);

  const layout = useMemo(
    () => pageLayout(session.pages, scale, pageSpacing),
    [session, scale, pageSpacing],
  );
  const innerWidth = Math.max(view.width, layout.width);
  const indices = visiblePages(layout.offsets, session.pages, scale, view.top, view.height, 450);

  const byPage = useMemo(() => {
    const map = new Map<number, Marker[]>();
    for (const a of preview ?? markers) {
      const list = map.get(a.page) ?? [];
      list.push(a);
      map.set(a.page, list);
    }
    return map;
  }, [markers, preview]);

  const updateView = useCallback(() => {
    const el = root.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    setView({
      top: el.scrollTop,
      left: el.scrollLeft,
      width: el.clientWidth,
      height: el.clientHeight,
    });
  }, []);

  const previousLayout = useRef({ sessionId: session.id, layout, scale, spacing: pageSpacing });
  useLayoutEffect(() => {
    const previous = previousLayout.current;
    previousLayout.current = { sessionId: session.id, layout, scale, spacing: pageSpacing };
    const el = root.current;
    if (
      !el ||
      previous.sessionId !== session.id ||
      (previous.spacing.paddingX === pageSpacing.paddingX &&
        previous.spacing.paddingY === pageSpacing.paddingY &&
        previous.spacing.gap === pageSpacing.gap)
    )
      return;
    // Keep the same document point at the top when spacing changes, even far into a long PDF.
    cancelAnimationFrame(navigationFrame.current);
    let index = 0;
    for (let i = 0; i < session.pages.length; i++) {
      if (previous.layout.offsets[i] <= view.top) index = i;
      else break;
    }
    const oldLeft =
      (Math.max(view.width, previous.layout.width) - session.pages[index].width * previous.scale) /
      2;
    const newLeft =
      (Math.max(el.clientWidth, layout.width) - session.pages[index].width * scale) / 2;
    el.scrollTop =
      view.top === 0
        ? 0
        : layout.offsets[index] +
          ((view.top - previous.layout.offsets[index]) / previous.scale) * scale;
    el.scrollLeft =
      props.zoomMode === 'fit' ? 0 : newLeft + ((view.left - oldLeft) / previous.scale) * scale;
    updateView();
  }, [
    session.id,
    session.pages,
    layout,
    scale,
    pageSpacing,
    props.zoomMode,
    view.top,
    view.left,
    view.width,
    updateView,
  ]);

  const scheduleView = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(updateView);
  }, [updateView]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(updateView);
    observer.observe(el);
    updateView();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(navigationFrame.current);
      cancelAnimationFrame(moveFrame.current);
    };
  }, [updateView]);

  const zoomAt = useCallback(
    (requested: number, cx?: number, cy?: number, mode: 'fit' | 'custom' = 'custom') => {
      const el = root.current;
      if (!el || el.clientWidth === 0) return;
      const { session, scale, onScale, pageSpacing } = latest.current,
        next = clamp(requested, 0.1, 32);
      const bounds = el.getBoundingClientRect(),
        rx = cx === undefined ? el.clientWidth / 2 : cx - bounds.left,
        ry = cy === undefined ? el.clientHeight / 2 : cy - bounds.top;
      const previousLayout = pageLayout(session.pages, scale, pageSpacing),
        nextLayout = pageLayout(session.pages, next, pageSpacing);
      const pointY = el.scrollTop + ry;
      let index = 0;
      for (let i = 0; i < session.pages.length; i++) {
        if (previousLayout.offsets[i] <= pointY) index = i;
        else break;
      }
      const page = session.pages[index],
        oldLeft = (Math.max(el.clientWidth, previousLayout.width) - page.width * scale) / 2;
      const x = (el.scrollLeft + rx - oldLeft) / scale,
        y = (pointY - previousLayout.offsets[index]) / scale;
      const atTop = el.scrollTop === 0;
      onScale(next);
      latest.current.onZoomMode(mode);
      cancelAnimationFrame(navigationFrame.current);
      navigationFrame.current = requestAnimationFrame(() => {
        const left = (Math.max(el.clientWidth, nextLayout.width) - page.width * next) / 2;
        el.scrollLeft = mode === 'fit' ? 0 : left + x * next - rx;
        el.scrollTop = mode === 'fit' && atTop ? 0 : nextLayout.offsets[index] + y * next - ry;
        updateView();
      });
    },
    [updateView],
  );

  const fit = useCallback(() => {
    const el = root.current;
    if (el && el.clientWidth > 0)
      zoomAt(
        (el.clientWidth - latest.current.pageSpacing.paddingX * 2) /
          latest.current.session.pages[0].width,
        undefined,
        undefined,
        'fit',
      );
  }, [zoomAt]);

  const jump = useCallback(
    (number: number) => {
      const el = root.current;
      if (!el) return;
      // A page jump supersedes a pending zoom anchor, after React applies its layout.
      cancelAnimationFrame(navigationFrame.current);
      navigationFrame.current = requestAnimationFrame(() => {
        const index = clamp(number - 1, 0, latest.current.session.pages.length - 1);
        const p = latest.current;
        const clearance =
          index === 0
            ? p.pageSpacing.paddingY
            : Math.min(24, p.pageSpacing.paddingY, p.pageSpacing.gap);
        el.scrollTop = pageLayout(p.session.pages, p.scale, p.pageSpacing).offsets[index] - clearance;
        updateView();
      });
    },
    [updateView],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => root.current?.focus({ preventScroll: true }),
      jump,
      fit,
      zoom: (factor) => zoomAt(latest.current.scale * factor),
      setZoom: (value) => zoomAt(value),
    }),
    [jump, fit, zoomAt],
  );

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    setRestoredSessionId(undefined);
    const saved = latest.current.initialView;
    const mode = saved?.zoomMode ?? latest.current.zoomMode;
    const widthBasis = el.clientWidth > 0 ? el.clientWidth : 900;
    const startScale =
      mode === 'fit'
        ? clamp((widthBasis - pageSpacing.paddingX * 2) / session.pages[0].width, 0.1, 32)
        : clamp(saved?.scale ?? latest.current.scale, 0.1, 32);
    onScale(startScale);
    latest.current.onZoomMode(mode);
    const index = clamp((saved?.page ?? 1) - 1, 0, session.pages.length - 1);
    const startLayout = pageLayout(session.pages, startScale, pageSpacing);
    const firstFrame = requestAnimationFrame(() => {
      const pageLeft =
        (Math.max(el.clientWidth, startLayout.width) - session.pages[index].width * startScale) / 2;
      el.scrollTop =
        saved?.y !== undefined
          ? startLayout.offsets[index] + saved.y * startScale
          : startLayout.offsets[index] -
            Math.min(pageSpacing.paddingY, index === 0 ? pageSpacing.paddingY : pageSpacing.gap);
      el.scrollLeft =
        mode === 'custom' && saved?.x !== undefined ? pageLeft + saved.x * startScale : 0;
      updateView();
      setRestoredSessionId(session.id);
    });
    return () => cancelAnimationFrame(firstFrame);
  }, [session.id]);

  useEffect(() => {
    if (restoring || props.zoomMode !== 'fit' || !active) return;
    const el = root.current;
    if (!el || el.clientWidth === 0) return;
    const target = clamp(
      (el.clientWidth - pageSpacing.paddingX * 2) / session.pages[0].width,
      0.1,
      32,
    );
    if (Math.abs(target - latest.current.scale) > 0.0001)
      zoomAt(target, undefined, undefined, 'fit');
  }, [view.width, pageSpacing.paddingX, props.zoomMode, restoring, session.id, active, zoomAt]);

  useEffect(() => {
    // A viewport entirely inside padding or a page gap has nothing to paint.
    // Release the loading screen so the user can scroll to the next paper.
    if (
      !restoring &&
      view.height > 0 &&
      visiblePages(layout.offsets, session.pages, scale, view.top, view.height, 0).length === 0
    )
      props.onFirstPaint?.(session.id);
  }, [restoring, view.top, view.height, layout, session, scale, props.onFirstPaint]);

  useEffect(() => {
    if (restoring || !active) return;
    const middle = view.top + view.height / 2;
    const best = nearestPage(layout.offsets, session.pages, scale, middle);
    onPage(best + 1);
    const left = (innerWidth - session.pages[best].width * scale) / 2;
    props.onViewChange(session.id, {
      page: best + 1,
      scale,
      zoomMode: props.zoomMode,
      x: (view.left - left) / scale,
      y: (view.top - layout.offsets[best]) / scale,
    });
  }, [
    view.top,
    view.left,
    view.height,
    view.width,
    layout,
    session,
    scale,
    onPage,
    props.onViewChange,
    props.zoomMode,
    restoring,
    active,
    innerWidth,
  ]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      const p = latest.current;
      if (!event.deltaY && !event.deltaX) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      if (
        p.disabled ||
        p.hostOverlayOpen ||
        document.querySelector('.folio-workbench [role="dialog"]')
      ) {
        resetWheel();
        p.onResizeHover(false);
        return;
      }
      const now = performance.now();
      const context = [
        event.ctrlKey,
        p.wheelZoom,
        p.wheelResize,
        p.tool,
        space.current,
        gesture.current,
        p.selected,
      ];
      let activeGesture = wheelGesture.current;
      if (
        !activeGesture ||
        now - activeGesture.at >= 200 ||
        activeGesture.context.some((value, index) => value !== context[index])
      ) {
        const resizing =
          !event.ctrlKey &&
          p.wheelResize &&
          p.tool !== 'hand' &&
          !space.current &&
          !gesture.current &&
          Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
          selectedAt(event.clientX, event.clientY);
        activeGesture = {
          kind: event.ctrlKey
            ? 'zoom'
            : resizing
              ? 'resize'
              : p.wheelZoom
                ? 'zoom'
                : 'scroll',
          context,
          at: now,
          group: {},
          remainder: 0,
        };
        wheelGesture.current = activeGesture;
      }
      activeGesture.at = now;
      clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        wheelGesture.current = null;
        updateResizeHover();
      }, 200);
      updateResizeHover();
      if (activeGesture.kind === 'scroll') return;
      event.preventDefault();
      if (activeGesture.kind === 'resize') {
        const delta =
          event.deltaMode === 1
            ? (event.deltaY * 100) / 3
            : event.deltaMode === 2
              ? Math.sign(event.deltaY) * 100
              : event.deltaY;
        if (Math.sign(delta) !== Math.sign(activeGesture.remainder)) activeGesture.remainder = 0;
        activeGesture.remainder += clamp(delta, -500, 500);
        const steps = Math.trunc(activeGesture.remainder / 100);
        if (steps) {
          activeGesture.remainder -= steps * 100;
          p.onResize(-steps, activeGesture.group);
        }
        return;
      }
      const delta = clamp(event.deltaY * (event.deltaMode === 1 ? 16 : 1), -300, 300);
      zoomAt(
        p.scale * Math.exp(-delta * (event.ctrlKey ? 0.008 : 0.0015)),
        event.clientX,
        event.clientY,
      );
    };
    el.addEventListener('wheel', wheel, { passive: false });

    const down = (e: KeyboardEvent) => {
      if (!latest.current.active || latest.current.hostOverlayOpen) return;
      if (e.key === 'Control') {
        control.current = true;
        resetWheel();
        updateResizeHover();
      }
      const target = e.target as HTMLElement;
      if (
        e.code === 'Space' &&
        !/INPUT|TEXTAREA|SELECT/.test(target.tagName) &&
        !target.isContentEditable &&
        !document.querySelector('.folio-workbench [role="dialog"]')
      ) {
        e.preventDefault();
        space.current = true;
        resetWheel();
        updateResizeHover();
        el.classList.add('space-pan');
        if (ghost.current) ghost.current.style.display = 'none';
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        control.current = false;
        resetWheel();
      }
      if (e.code === 'Space') {
        space.current = false;
        el.classList.remove('space-pan');
        resetWheel();
      }
      updateResizeHover();
    };
    const blur = () => {
      control.current = false;
      pointer.current = null;
      resetWheel();
      latest.current.onResizeHover(false);
      space.current = false;
      el.classList.remove('space-pan');
      cancelGesture();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      resetWheel();
      latest.current.onResizeHover(false);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [zoomAt, selectedAt, resetWheel, updateResizeHover, cancelGesture]);

  function hitPage(cx: number, cy: number) {
    const element = document.elementFromPoint(cx, cy)?.closest<HTMLElement>('[data-page]');
    if (!element || !root.current?.contains(element)) return null;
    return {
      element,
      number: Number(element.dataset.page),
      bounds: element.getBoundingClientRect(),
    };
  }

  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    pointer.current = { x: e.clientX, y: e.clientY };
    resetWheel();
    latest.current.onResizeHover(false);
    const el = root.current;
    if (!el || e.button > 1 || (e.target as Element).closest('.page-error')) return;
    el.focus({ preventScroll: true });
    const deleteId = (e.target as Element).closest<HTMLElement>('[data-delete]')?.dataset.delete;
    if (deleteId) {
      e.stopPropagation();
      onDelete(new Set([deleteId]));
      return;
    }
    const id = (e.target as Element).closest<HTMLElement>('[data-marker]')?.dataset.marker;
    let kind: Gesture['kind'] = 'select',
      ids = selected,
      primary: Marker | undefined,
      offsetX = 0,
      offsetY = 0;
    if (e.button === 1 || space.current || tool === 'hand') kind = 'pan';
    else if (id) {
      if (e.shiftKey) {
        e.preventDefault();
        const next = new Set(selected);
        next.has(id) ? next.delete(id) : next.add(id);
        onSelect(next);
        return;
      }
      ids = selected.has(id) ? selected : new Set([id]);
      onSelect(ids);
      primary = markers.find((a) => a.id === id);
      const page = hitPage(e.clientX, e.clientY);
      if (!primary || !page) return;
      kind = 'drag';
      offsetX = primary.x - (e.clientX - page.bounds.left) / scale;
      offsetY = primary.y - (e.clientY - page.bounds.top) / scale;
    } else if (tool === 'marker') kind = 'place';
    else if (!e.shiftKey) onSelect(new Set());
    e.preventDefault();
    if (kind !== 'drag') el.setPointerCapture(e.pointerId);
    gesture.current = {
      pointerId: e.pointerId,
      kind,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      scrollTop: el.scrollTop,
      scrollLeft: el.scrollLeft,
      original: markers,
      ids,
      primary,
      offsetX,
      offsetY,
      additive: e.shiftKey,
    };
    if (kind === 'pan') setPanning(true);
  }

  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    pointer.current = { x: e.clientX, y: e.clientY };
    updateResizeHover();
    const g = gesture.current,
      el = root.current;
    if (!el) return;
    const cx = e.clientX,
      cy = e.clientY;
    if (!g) {
      if (ghost.current) {
        const valid =
          tool === 'marker' &&
          !space.current &&
          hitPage(cx, cy) &&
          !(e.target as Element).closest('[data-marker]');
        ghost.current.style.display = valid ? 'block' : 'none';
        ghost.current.style.left = cx + 'px';
        ghost.current.style.top = cy + 'px';
      }
      return;
    }
    if (ghost.current) ghost.current.style.display = 'none';
    if (!g.moved && Math.hypot(cx - g.x, cy - g.y) < 3) return;
    g.moved = true;
    if (g.kind === 'drag' && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
    if (g.kind === 'pan') {
      el.scrollLeft = g.scrollLeft - (cx - g.x);
      el.scrollTop = g.scrollTop - (cy - g.y);
      return;
    }
    if (g.kind === 'select') {
      setSelectionBox({
        x: Math.min(cx, g.x),
        y: Math.min(cy, g.y),
        width: Math.abs(cx - g.x),
        height: Math.abs(cy - g.y),
      });
      return;
    }
    if (g.kind !== 'drag' || !g.primary) return;
    const page = hitPage(cx, cy),
      samePage = g.original.filter((a) => g.ids.has(a.id)).every((a) => a.page === g.primary!.page);
    let next: Marker[];
    if (page && samePage) {
      const info = session.pages[page.number - 1],
        group = g.original.filter((a) => g.ids.has(a.id));
      const dxs = group.map((a) => a.x - g.primary!.x),
        dys = group.map((a) => a.y - g.primary!.y);
      const x = clamp(
        (cx - page.bounds.left) / scale + g.offsetX!,
        -Math.min(...dxs),
        info.width - Math.max(...dxs),
      );
      const y = clamp(
        (cy - page.bounds.top) / scale + g.offsetY!,
        -Math.min(...dys),
        info.height - Math.max(...dys),
      );
      next = g.original.map((a) =>
        g.ids.has(a.id)
          ? { ...a, page: page.number, x: x + a.x - g.primary!.x, y: y + a.y - g.primary!.y }
          : a,
      );
    } else {
      next = g.original.map((a) =>
        g.ids.has(a.id)
          ? {
              ...a,
              x: clamp(a.x + (cx - g.x) / scale, 0, session.pages[a.page - 1].width),
              y: clamp(a.y + (cy - g.y) / scale, 0, session.pages[a.page - 1].height),
            }
          : a,
      );
    }
    previewRef.current = next;
    cancelAnimationFrame(moveFrame.current);
    moveFrame.current = requestAnimationFrame(() => setPreview(next));
  }

  function pointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointer.current = { x: e.clientX, y: e.clientY };
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    cancelAnimationFrame(moveFrame.current);
    if (root.current?.hasPointerCapture(e.pointerId))
      root.current.releasePointerCapture(e.pointerId);
    if (g.kind === 'place' && !g.moved) {
      const page = hitPage(e.clientX, e.clientY);
      if (page)
        onAdd(
          page.number,
          (e.clientX - page.bounds.left) / scale,
          (e.clientY - page.bounds.top) / scale,
        );
    }
    if (g.kind === 'drag' && g.moved && previewRef.current) onCommit(previewRef.current);
    if (g.kind === 'select' && g.moved) {
      const ids = g.additive ? new Set(g.ids) : new Set<string>();
      const x1 = Math.min(g.x, e.clientX),
        x2 = Math.max(g.x, e.clientX),
        y1 = Math.min(g.y, e.clientY),
        y2 = Math.max(g.y, e.clientY);
      for (const a of markers) {
        const offset = layout.offsets[a.page - 1],
          left = (innerWidth - session.pages[a.page - 1].width * scale) / 2;
        const bounds = root.current!.getBoundingClientRect();
        const x = bounds.left + left + a.x * scale - root.current!.scrollLeft,
          y = bounds.top + offset + a.y * scale - root.current!.scrollTop;
        if (x >= x1 && x <= x2 && y >= y1 && y <= y2) ids.add(a.id);
      }
      onSelect(ids);
    }
    setPanning(false);
    setSelectionBox(null);
    setPreview(null);
    previewRef.current = null;
    updateResizeHover();
  }

  return (
    <div
      ref={root}
      className={`viewer tool-${tool} ${panning ? 'panning' : ''}`}
      tabIndex={-1}
      role="region"
      aria-label="PDF 标注画布"
      data-testid="viewer"
      onScroll={() => {
        scheduleView();
        updateResizeHover();
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={cancelGesture}
      onContextMenu={(e) => {
        if (tool !== 'marker' || props.disabled) return;
        e.preventDefault();
        cancelGesture();
        resetWheel();
        root.current?.focus({ preventScroll: true });
        props.onExitMarkerMode();
      }}
      onPointerLeave={() => {
        pointer.current = null;
        updateResizeHover();
        if (ghost.current) ghost.current.style.display = 'none';
      }}
    >
      <div className="pages-space" style={{ width: innerWidth, height: layout.height }}>
        {indices.map((index) => {
          const page = session.pages[index],
            left = (innerWidth - page.width * scale) / 2;
          const visible: Rect = {
            x: Math.max(0, (view.left - left) / scale),
            y: Math.max(0, (view.top - layout.offsets[index]) / scale),
            width: view.width / scale,
            height: view.height / scale,
          };
          return (
            <div
              className="pdf-page"
              data-page={page.number}
              key={`${session.id}-${page.number}`}
              style={{
                top: layout.offsets[index],
                left,
                width: page.width * scale,
                height: page.height * scale,
              }}
            >
              <PageCanvas
                session={session}
                index={index}
                scale={scale}
                viewport={visible}
                onReady={
                  layout.offsets[index] + page.height * scale > view.top &&
                  layout.offsets[index] < view.top + view.height
                    ? props.onFirstPaint
                    : undefined
                }
              />
              <div className="marker-layer">
                {(byPage.get(page.number) ?? []).map((a) => (
                  <div
                    key={a.id}
                    data-marker={a.id}
                    data-testid={`marker-${a.number}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`序号 ${a.number}，第 ${a.page} 页`}
                    aria-pressed={selected.has(a.id)}
                    title={
                      selected.has(a.id) && props.wheelResize && tool !== 'hand'
                        ? '滚轮调整圆圈大小；[ 缩小，] 放大；Ctrl＋滚轮缩放文档'
                        : undefined
                    }
                    className={`marker ${selected.has(a.id) ? 'is-selected' : ''}`}
                    style={{
                      left: a.x * scale,
                      top: a.y * scale,
                      width: a.size * scale,
                      height: a.size * scale,
                    }}
                    onFocus={() => onSelect(new Set([a.id]))}
                    onDoubleClick={() => onEdit(a.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onEdit(a.id);
                    }}
                  >
                    <MarkerGlyph style={a} number={a.number} />
                    {selected.has(a.id) && (
                      <button
                        className="marker-delete"
                        data-delete={a.id}
                        aria-label={`删除序号 ${a.number}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {(index === session.pages.length - 1 ? pageSpacing.paddingY : pageSpacing.gap) >=
                22 && <span className="page-label">{String(page.number).padStart(2, '0')}</span>}
            </div>
          );
        })}
      </div>
      <div
        className="marker ghost"
        ref={ghost}
        style={{ display: 'none', width: style.size * scale, height: style.size * scale }}
      >
        <MarkerGlyph style={style} number={nextNumber} />
      </div>
      {selectionBox && (
        <div
          className="selection-box"
          style={{
            left: selectionBox.x,
            top: selectionBox.y,
            width: selectionBox.width,
            height: selectionBox.height,
          }}
        />
      )}
    </div>
  );
});
