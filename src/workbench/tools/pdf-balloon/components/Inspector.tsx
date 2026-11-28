import { useEffect, useId, useRef, useState } from 'react';
import {
  SlidersHorizontal,
  RotateCcw,
  Link2,
  Unlink2,
  CirclePlus,
  Move,
  ChevronDown,
} from 'lucide-react';
import type { Marker, MarkerStyle } from '../types';
import { MarkerGlyph } from './MarkerGlyph';
import { DockIcon } from './DockIcon';
import { NumberField } from './NumberField';

const COLORS = [
  '#dc4c3e',
  '#2563eb',
  '#171c22',
  '#24845e',
  '#d88520',
  '#8859bd',
  '#64748b',
  '#ffffff',
];

// Each theme column contains its base color followed by five Office-style shades.
const OFFICE_THEME_COLORS = [
  ['白色', '#ffffff', '#f2f2f2', '#d9d9d9', '#bfbfbf', '#a6a6a6', '#808080'],
  ['黑色', '#000000', '#808080', '#595959', '#404040', '#262626', '#0d0d0d'],
  ['浅灰', '#e7e6e6', '#d0cece', '#aeaaaa', '#757171', '#3b3838', '#181717'],
  ['蓝灰', '#44546a', '#d6dce4', '#adb9ca', '#8497b0', '#333f50', '#222a35'],
  ['蓝色', '#4472c4', '#d9e2f3', '#b4c6e7', '#8ea9db', '#305496', '#203864'],
  ['橙色', '#ed7d31', '#fce4d6', '#f8cbad', '#f4b183', '#c55a11', '#833c0b'],
  ['黄色', '#ffc000', '#fff2cc', '#ffe699', '#ffd966', '#bf9000', '#806000'],
  ['绿色', '#70ad47', '#e2efda', '#c6e0b4', '#a9d18e', '#548235', '#375623'],
  ['青色', '#2cbcb1', '#d5f2ef', '#abe4e0', '#80d7d0', '#218d85', '#165e59'],
  ['红色', '#e94b5f', '#fbdbe0', '#f6b7bf', '#f2939f', '#af3847', '#752630'],
];

const OFFICE_STANDARD_COLORS = [
  '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050',
  '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0',
];

interface Props {
  simplifiedPalette: boolean;
  onSimplifiedPaletteChange: (value: boolean) => void;
  style: MarkerStyle;
  selected: Marker[];
  next: number;
  linked: boolean;
  onLinked: (value: boolean) => void;
  onNext: (n: number) => void;
  onChange: (value: Partial<MarkerStyle>) => void;
  onNumber: (value: number) => void;
  onReset: () => void;
  disabled: boolean;
  placement: 'toolbar' | 'sidebar';
  onPlacementChange: (placement: 'toolbar' | 'sidebar') => void;
}

export function Inspector({
  simplifiedPalette,
  onSimplifiedPaletteChange,
  style,
  selected,
  next,
  linked,
  onLinked,
  onNext,
  onChange,
  onNumber,
  onReset,
  disabled,
  placement,
  onPlacementChange,
}: Props) {
  const [draft, setDraft] = useState(style),
    [colorKey, setColorKey] = useState<'borderColor' | 'fillColor' | 'textColor'>('borderColor');
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number }>({ left: 8, top: 88 });
  const colorPopoverId = useId();
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const colorPopoverRef = useRef<HTMLDivElement>(null);
  const Container = placement === 'toolbar' ? 'div' : 'aside';

  // Position updates create a new Marker object but do not change the style.
  // Depending on `style` itself would make every drag/keypress reset this
  // draft and can trigger a React update loop with many selected markers.
  useEffect(() => {
    setDraft(style);
  }, [
    style.size,
    style.textSize,
    style.borderWidth,
    style.borderColor,
    style.fillColor,
    style.textColor,
  ]);

  // Close floating color panel when switching placement or becoming disabled.
  useEffect(() => {
    if (placement !== 'toolbar' || disabled) {
      setColorPopoverOpen(false);
    }
  }, [placement, disabled]);

  // Universal outside-click / Escape / resize close (works across all macOS WKWebView & WebView2 versions).
  useEffect(() => {
    if (!colorPopoverOpen || placement !== 'toolbar') return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !colorPopoverRef.current?.contains(target) &&
        !colorTriggerRef.current?.contains(target)
      ) {
        setColorPopoverOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setColorPopoverOpen(false);
        colorTriggerRef.current?.focus();
      }
    };
    const onResize = () => setColorPopoverOpen(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
    };
  }, [colorPopoverOpen, placement]);

  function range(
    key: 'size' | 'textSize' | 'borderWidth',
    title: string,
    min: number,
    max: number,
  ) {
    return (
      <div className="range-field">
        <div>
          <label htmlFor={`${key}-value`}>{title}</label>
          <NumberField
            id={`${key}-value`}
            label={`${title}数值`}
            value={draft[key]}
            min={min}
            max={max}
            step={0.1}
            unit="pt"
            disabled={disabled}
            onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))}
            onCommit={(value) => onChange({ [key]: value })}
          />
        </div>
        <input
          id={key}
          aria-label={title}
          type="range"
          min={min}
          max={max}
          step="0.1"
          value={draft[key]}
          disabled={disabled}
          onChange={(e) => setDraft((s) => ({ ...s, [key]: Number(e.target.value) }))}
          onPointerUp={() => onChange({ [key]: draft[key] })}
          onKeyUp={() => onChange({ [key]: draft[key] })}
        />
      </div>
    );
  }

  function colorSwatch(color: string, key: string = color, name?: string) {
    const chosen = draft[colorKey]?.toLowerCase() === color;
    return (
      <button
        key={key}
        type="button"
        aria-label={`${colorKey === 'borderColor' ? '边框' : colorKey === 'fillColor' ? '填充' : '文字'}颜色 ${color}`}
        aria-pressed={chosen}
        title={name ? `${name} · ${color.toUpperCase()}` : color.toUpperCase()}
        className={chosen ? 'chosen' : ''}
        style={{ backgroundColor: color }}
        onClick={() => onChange({ [colorKey]: color })}
      />
    );
  }

  const resetButton = (
    <button
      className="icon-btn reset-style"
      title="恢复默认样式"
      aria-label="恢复默认样式"
      onClick={onReset}
      disabled={disabled}
    >
      <RotateCcw size={15} />
    </button>
  );

  const colorPanelVisible = placement === 'sidebar' || colorPopoverOpen;

  return (
    <Container
      className={`inspector inspector-${placement}`}
      data-placement={placement}
      aria-label="标注属性"
    >
      <div className="inspector-header">
        <span title="标注属性">
          <SlidersHorizontal size={16} />
          <span className="tool-window-name">标注属性</span>
        </span>
        <div className="inspector-header-actions">
          <button
            className="icon-btn dock-button"
            aria-label={placement === 'toolbar' ? '停靠到右侧' : '停靠到顶部'}
            title={placement === 'toolbar' ? '停靠到右侧' : '停靠到顶部'}
            onClick={() => onPlacementChange(placement === 'toolbar' ? 'sidebar' : 'toolbar')}
          >
            <DockIcon direction={placement === 'toolbar' ? 'right' : 'top'} />
          </button>
          {placement === 'sidebar' && resetButton}
        </div>
      </div>
      <div className="inspector-scroll">
        <div className="property-context">
          <span className="tiny-dot" />
          {selected.length ? `已选中 ${selected.length} 个标注` : '新建标注的默认样式'}
        </div>
        <div className="marker-preview">
          <div style={{ width: 68, height: 68 }}>
            <MarkerGlyph
              style={{ ...draft, size: draft.size }}
              number={selected.at(-1)?.number ?? next}
            />
          </div>
          <span>样式预览</span>
        </div>
        <fieldset disabled={disabled}>
          <div className="section-label">编号设置</div>
          <div className="form-row">
            <label htmlFor="next-number">下一个编号</label>
            <NumberField
              id="next-number"
              label="下一个编号"
              value={next}
              min={0}
              max={999999}
              disabled={disabled}
              onChange={onNext}
            />
          </div>
          {selected.length === 1 && (
            <div className="form-row">
              <label htmlFor="selected-number">当前序号</label>
              <NumberField
                id="selected-number"
                label="当前序号"
                value={selected[0].number}
                min={0}
                max={999999}
                disabled={disabled}
                onChange={onNumber}
              />
            </div>
          )}
          <div className="section-divider" />
          <div className="section-label">
            尺寸与文字
            <button
              className={`link-toggle ${linked ? 'active' : ''}`}
              onClick={() => onLinked(!linked)}
              aria-pressed={linked}
              title="圆圈与字号等比联动"
            >
              {linked ? <Link2 size={13} /> : <Unlink2 size={13} />}联动
            </button>
          </div>
          {range('size', '圆圈大小', 4, 120)}
          {range('textSize', '文字大小', 2, 80)}
          {range('borderWidth', '边框粗细', 0, 8)}
          <div className="section-divider" />
          <div className="section-label">颜色</div>
          {placement === 'toolbar' && (
            <button
              ref={colorTriggerRef}
              className={`toolbar-colors-trigger ${colorPopoverOpen ? 'is-open' : ''}`}
              aria-expanded={colorPopoverOpen}
              aria-controls={colorPopoverId}
              title="标注颜色"
              aria-label="标注颜色"
              onClick={(e) => {
                if (colorPopoverOpen) {
                  setColorPopoverOpen(false);
                  return;
                }
                const bounds = e.currentTarget.getBoundingClientRect();
                setPopoverPos({
                  left: Math.max(8, Math.min(bounds.left, window.innerWidth - 238)),
                  top: Math.min(bounds.bottom + 7, window.innerHeight - 310),
                });
                setColorPopoverOpen(true);
              }}
            >
              <span
                className="color-dot"
                style={{ backgroundColor: draft.borderColor ?? 'transparent' }}
              />
              <span>颜色</span>
              <ChevronDown size={11} />
            </button>
          )}
          {placement === 'toolbar' && resetButton}
          {colorPanelVisible && (
            <div
              ref={colorPopoverRef}
              className={placement === 'toolbar' ? 'toolbar-color-popover' : 'inspector-colors'}
              id={colorPopoverId}
              style={
                placement === 'toolbar'
                  ? { left: `${popoverPos.left}px`, top: `${popoverPos.top}px` }
                  : undefined
              }
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setColorPopoverOpen(false);
                }
              }}
            >
              <div className="color-fields">
                {(
                  [
                    ['borderColor', '边框'],
                    ['fillColor', '填充'],
                    ['textColor', '文字'],
                  ] as const
                ).map(([key, title]) => (
                  <button
                    key={key}
                    className={colorKey === key ? 'active' : ''}
                    onClick={() => setColorKey(key)}
                  >
                    <span
                      className={`color-dot ${!draft[key] ? 'transparent-color' : ''}`}
                      style={{ backgroundColor: draft[key] ?? undefined }}
                    />
                    {title}
                  </button>
                ))}
              </div>
              <div className="palette-heading">
                <span>{simplifiedPalette ? '简化色盘' : 'Office 色盘'}</span>
                <label className="palette-simplify">
                  简化
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="简化色盘"
                    checked={simplifiedPalette}
                    onChange={(e) => onSimplifiedPaletteChange(e.target.checked)}
                  />
                  <span className="palette-switch-track" aria-hidden="true" />
                </label>
              </div>
              {simplifiedPalette ? (
                <div className="palette" role="group" aria-label="简化颜色">
                  {COLORS.map((color) => colorSwatch(color))}
                </div>
              ) : (
                <div className="office-palette">
                  <div className="office-palette-label">主题颜色</div>
                  <div className="office-theme-grid" role="group" aria-label="主题颜色">
                    {OFFICE_THEME_COLORS.map(([name, ...colors]) => (
                      <div className="office-color-column" key={name}>
                        {colors.map((color, index) =>
                          colorSwatch(
                            color,
                            `${name}-${index}`,
                            `${name}${index ? ` · 色阶 ${index}` : ''}`,
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="office-palette-label">标准色</div>
                  <div className="office-standard-grid" role="group" aria-label="标准色">
                    {OFFICE_STANDARD_COLORS.map((color) => colorSwatch(color))}
                  </div>
                </div>
              )}
              <div className="custom-color">
                <label>
                  自定义颜色
                  <input
                    aria-label="自定义颜色"
                    type="color"
                    value={draft[colorKey] ?? '#ffffff'}
                    onChange={(e) => onChange({ [colorKey]: e.target.value })}
                  />
                </label>
                {colorKey !== 'textColor' && (
                  <button
                    className={!draft[colorKey] ? 'active' : ''}
                    onClick={() => onChange({ [colorKey]: null })}
                  >
                    <span className="transparent-color" />无
                    {colorKey === 'fillColor' ? '填充' : '边框'}
                  </button>
                )}
              </div>
            </div>
          )}
        </fieldset>

        <div className="section-divider" />
        <div className="section-label">快捷操作</div>
        <div className="shortcut-row">
          <span>
            <CirclePlus size={13} />
            添加序号
          </span>
          <kbd>N</kbd>
        </div>
        <div className="shortcut-row">
          <span>
            <Move size={13} />
            拖动平移
          </span>
          <kbd>Space</kbd>
        </div>
        <div className="shortcut-row">
          <span>多选 / 框选</span>
          <kbd>Shift</kbd>
        </div>
        <div className="shortcut-row">
          <span>缩放图纸</span>
          <kbd>Ctrl + 滚轮</kbd>
        </div>
      </div>
      <div className="inspector-footer">
        {selected.length ? '修改将应用到所有选中的标注' : '选择标注后可在这里编辑其属性'}
      </div>
    </Container>
  );
}
