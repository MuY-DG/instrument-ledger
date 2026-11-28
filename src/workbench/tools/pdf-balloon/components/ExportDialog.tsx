import { useEffect, useState } from 'react';
import { Download, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import type { Marker, PdfSession } from '../types';
import { ExportPreview } from './ExportPreview';
import type { ImageOptions } from '../core/export';
import { exportScale, parseRange } from '../core/geometry';
import { Dialog } from './Dialog';
import { EXPORT_DPIS, type ExportPreferences } from '../core/preferences';
import { IMAGE_BUDGETS, normalizeImageBudgetMode, resolveImageBudget } from '../core/image-budget';
import { imageDpiLimit, imageOutputBudget, imagePlan } from '../core/image-plan';
export function ExportDialog({
  session,
  currentPage,
  markers,
  onClose,
  onExport,
  initialPreferences,
  onPreferencesChange,
}: {
  session: PdfSession;
  currentPage: number;
  markers: Marker[];
  onClose: () => void;
  onExport: (options: ImageOptions) => void;
  initialPreferences: ExportPreferences;
  onPreferencesChange: (value: Partial<ExportPreferences>) => void;
}) {
  const [format, setFormat] = useState<ImageOptions['format']>(initialPreferences.format),
    [dpi, setDpi] = useState(initialPreferences.dpi),
    [range, setRange] = useState('current'),
    [custom, setCustom] = useState(''),
    [annotations, setAnnotations] = useState(initialPreferences.annotations),
    [quality, setQuality] = useState(initialPreferences.quality),
    [budgetMode, setBudgetMode] = useState(initialPreferences.budgetMode),
    [error, setError] = useState(''),
    [previewSelection, setPreviewSelection] = useState(currentPage);
  const [detected, setDetected] = useState<{
    session: PdfSession;
    page: number;
    dpi: number;
  } | null>(null);
  let pages: number[] = [],
    rangeError = '';
  try {
    pages =
      range === 'all'
        ? session.pages.map((p) => p.number)
        : range === 'current'
          ? [currentPage]
          : parseRange(custom, session.pages.length);
  } catch (e) {
    rangeError = (e as Error).message;
  }
  const budget = resolveImageBudget(budgetMode),
    previewPage = pages.includes(previewSelection) ? previewSelection : (pages[0] ?? currentPage),
    previewIndex = pages.indexOf(previewPage),
    page = session.pages[previewPage - 1],
    maxDpi = pages.reduce(
      (limit, n) => Math.min(limit, imageDpiLimit(session.pages[n - 1], format, budget)),
      3200,
    ),
    dpiOptions = [...new Set([...EXPORT_DPIS, maxDpi, ...(dpi === 'auto' ? [] : [Number(dpi)])])]
      .filter((d) => d > 0)
      .sort((a, b) => a - b),
    unavailable = dpi !== 'auto' && Number(dpi) > maxDpi,
    matchedDpi = detected?.session === session && detected.page === previewPage ? detected.dpi : null,
    k = dpi === 'auto'
      ? (matchedDpi === null ? null : exportScale(page, matchedDpi, budget))
      : Number(dpi) / 72,
    dimensions = k === null ? null : imagePlan(page, k, format, budget),
    outputBudget = imageOutputBudget(format, budget);
  useEffect(() => {
    if (dpi !== 'auto') return;
    let cancelled = false;
    import('../core/export')
      .then(({ imageDpi }) => imageDpi(session, previewPage))
      .then((value) => {
        if (!cancelled) setDetected({ session, page: previewPage, dpi: value });
      })
      .catch((e) => {
        if (!cancelled) setError(`无法检测原图分辨率：${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [session, previewPage, dpi]);
  function submit() {
    try {
      if (rangeError) throw new Error(rangeError);
      if (!pages.length) throw new Error('请选择要导出的页面');
      if (unavailable)
        throw new Error(`所选页面最高支持 ${maxDpi} DPI，请调整导出档位或降低清晰度`);
      onExport({ format, dpi, pages, annotations, quality, budgetMode });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const formatName = format === 'jpg' ? 'JPEG' : format === 'png' ? 'PNG' : 'WebP';
  const visibleRangeError = range === 'custom' && custom.trim() ? rangeError : '';
  return (
    <Dialog title="导出图片" onClose={onClose} className="export-dialog">
      <div className="export-body">
        <div className="export-settings">
          <div className="export-field">
            <span className="export-field-label" id="export-format-label">图片格式</span>
            <div className="format-options" role="group" aria-labelledby="export-format-label">
              {([['jpg', 'JPEG'], ['png', 'PNG'], ['webp', 'WebP']] as const).map(([key, title]) => (
                <button
                  key={key}
                  className={format === key ? 'active' : ''}
                  aria-pressed={format === key}
                  onClick={() => {
                    setFormat(key);
                    setError('');
                    onPreferencesChange({ format: key });
                  }}
                >{title}</button>
              ))}
            </div>
          </div>
          <div className="export-field">
            <label htmlFor="export-range">导出页面</label>
            <select id="export-range" value={range} onChange={(e) => { setRange(e.target.value); setError(''); }}>
              <option value="current">当前页 · 第 {currentPage} 页</option>
              <option value="all">全部 {session.pages.length} 页</option>
              <option value="custom">自定义范围</option>
            </select>
            {range === 'custom' && (
              <>
                <input
                  aria-label="自定义页面范围"
                  aria-invalid={!!visibleRangeError}
                  aria-describedby={visibleRangeError ? 'export-range-error' : 'export-range-hint'}
                  placeholder="例如 1-3,5"
                  value={custom}
                  onChange={(e) => { setCustom(e.target.value); setError(''); }}
                />
                {visibleRangeError
                  ? <p className="form-error" id="export-range-error" role="alert">{visibleRangeError}</p>
                  : <small id="export-range-hint">支持连续页和间隔页，例如 1-3,5。</small>}
              </>
            )}
          </div>
          <div className="export-field">
            <label htmlFor="export-dpi">清晰度</label>
            <select
              id="export-dpi"
              aria-label="导出清晰度"
              aria-invalid={unavailable}
              aria-describedby={unavailable ? 'export-dpi-error' : undefined}
              value={dpi}
              onChange={(e) => {
                setDpi(e.target.value);
                setError('');
                onPreferencesChange({ dpi: e.target.value });
              }}
            >
              <option value="auto">自动匹配原图</option>
              {dpiOptions.map((d) => (
                <option key={d} value={d} disabled={d > maxDpi}>
                  {d} DPI{d > maxDpi ? ' · 超出本次上限' : d === maxDpi ? ' · 本次可用上限' : ''}
                </option>
              ))}
            </select>
            {unavailable && <p className="form-error" id="export-dpi-error" role="alert">所选清晰度超出本次 {maxDpi} DPI 上限，请降低清晰度、选择自动匹配或在高级设置中提高导出档位。</p>}
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={annotations}
              onChange={(e) => { setAnnotations(e.target.checked); onPreferencesChange({ annotations: e.target.checked }); }}
            />包含圆圈标注
          </label>
          <details className="export-advanced">
            <summary><SlidersHorizontal size={15} /><span>高级设置</span><ChevronDown size={15} /></summary>
            <div className="export-advanced-fields">
              <div className="export-field">
                <label htmlFor={format === 'png' ? undefined : 'export-quality'}>压缩质量</label>
                {format === 'png' ? <div className="export-lossless">PNG 采用无损压缩，无需设置质量</div> : (
                  <select
                    id="export-quality"
                    aria-label="压缩质量"
                    value={quality}
                    onChange={(e) => { setQuality(Number(e.target.value)); onPreferencesChange({ quality: Number(e.target.value) }); }}
                  >
                    <option value="1">极限 · 100%</option>
                    <option value="0.98">最高 · 98%</option>
                    <option value="0.95">高 · 95%</option>
                    <option value="0.9">标准 · 90%</option>
                  </select>
                )}
              </div>
              <div className="export-field">
                <label htmlFor="export-budget">导出档位</label>
                <select
                  id="export-budget"
                  aria-describedby="export-budget-hint"
                  value={budgetMode}
                  onChange={(e) => {
                    const value = normalizeImageBudgetMode(e.target.value);
                    setBudgetMode(value);
                    setError('');
                    onPreferencesChange({ budgetMode: value });
                  }}
                >
                  <option value="auto">自动推荐 · {IMAGE_BUDGETS[budget.recommended].label}</option>
                  {(['safe', 'high', 'ultra'] as const).map((mode) => (
                    <option key={mode} value={mode}>{IMAGE_BUDGETS[mode].label} · 自动最高 {IMAGE_BUDGETS[mode].maxPixels / 10_000} 万像素</option>
                  ))}
                </select>
                <small id="export-budget-hint">控制大图的资源上限，通常保持自动推荐即可。</small>
              </div>
              <details className="export-technical">
                <summary>了解分辨率与资源限制<ChevronDown size={13} /></summary>
                <div className="export-info">
                  <p id="export-budget-description">
                    {budget.reportedMemory === null
                      ? '浏览器未提供设备内存信息，自动模式使用稳健档。'
                      : `浏览器报告内存等级约 ${budget.reportedMemory} GiB，自动推荐${IMAGE_BUDGETS[budget.recommended].label}档；此值不代表当前空闲内存。`}
                    当前{budget.label}档：自动清晰度预算 {budget.maxPixels / 10_000} 万像素。
                    {format === 'webp' ? 'WebP 使用整页编码；超大图片可切换 PNG / JPEG 分块导出。'
                      : `PNG / JPEG 超过整页阈值时自动分块，单页输出最多 ${outputBudget.maxPixels / 10_000} 万像素，单边 ${outputBudget.maxDimension.toLocaleString()} 像素。`}
                  </p>
                  <p>所选页面最高支持 {maxDpi} DPI；指定 DPI 按所选分辨率导出，自动模式受当前档位限制。</p>
                  {dimensions && <p>第 {previewPage} 页预计 {dimensions.width.toLocaleString()} × {dimensions.height.toLocaleString()} 像素。
                    {dimensions.tiled ? '分块像素缓冲估算约' : '该页画布内存约'} {Math.ceil(dimensions.bufferBytes / 1024 ** 2)} MiB；PDF 解码、图片编码及多页打包还需额外内存。</p>}
                  <p>{format === 'png' ? 'PNG 采用无损压缩，可调整 DPI 改变尺寸和体积。' : 'DPI 决定像素尺寸；压缩质量影响细节与文件体积，不改变像素尺寸。'}</p>
                </div>
              </details>
            </div>
          </details>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <aside className="export-preview" aria-label="导出结果预览">
          <div className="export-preview-heading">
            <span>导出预览</span>
            <div className="export-preview-pager">
              <button className="icon-btn" aria-label="预览上一张" disabled={previewIndex <= 0} onClick={() => setPreviewSelection(pages[previewIndex - 1])}><ChevronLeft size={15} /></button>
              <span>{pages.length ? `${previewIndex + 1} / ${pages.length}` : '—'}</span>
              <button className="icon-btn" aria-label="预览下一张" disabled={previewIndex < 0 || previewIndex >= pages.length - 1} onClick={() => setPreviewSelection(pages[previewIndex + 1])}><ChevronRight size={15} /></button>
            </div>
          </div>
          <div className="export-preview-stage">
            {pages.length ? <ExportPreview session={session} pageNumber={previewPage} markers={markers} annotations={annotations} /> : <span className="export-preview-empty">填写有效的页面范围后显示预览</span>}
          </div>
          <p className="export-preview-caption">{pages.length ? `第 ${previewPage} 页 · 缩略预览，实际清晰度以导出为准` : '尚未选择页面'}</p>
          <dl className="export-output-summary" aria-live="polite" aria-atomic="true">
            <div><dt>图片尺寸</dt><dd>{!pages.length ? '—' : dimensions ? `${dimensions.width.toLocaleString()} × ${dimensions.height.toLocaleString()} px` : '正在检测…'}</dd></div>
            <div><dt>清晰度</dt><dd>{!pages.length ? '—' : k === null ? '正在检测…' : `${(k * 72).toLocaleString(undefined, { maximumFractionDigits: 1 })} DPI`}</dd></div>
            <div><dt>导出数量</dt><dd>{pages.length} 张{pages.length > 1 ? ' · ZIP 压缩包' : ` · ${formatName} 图片`}</dd></div>
            <div><dt>圆圈标注</dt><dd>{annotations ? '包含' : '不包含'}</dd></div>
          </dl>
          {pages.length > 1 && <p className="export-preview-note">尺寸对应第 {previewPage} 页，各页按所选清晰度分别导出。</p>}
        </aside>
      </div>
      <div className="dialog-actions export-actions">
        <span className="export-action-summary">{formatName} · {pages.length ? `${pages.length} 张图片` : '请选择页面'}{pages.length > 1 ? ' · 打包为 ZIP' : ''}</span>
        <button onClick={onClose}>取消</button>
        <button className="primary-button" onClick={submit} disabled={unavailable || !pages.length || !!rangeError}>
          <Download size={15} />开始导出
        </button>
      </div>
    </Dialog>
  );
}
