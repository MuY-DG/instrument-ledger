interface Props {
  label: string;
  progress?: number;
  onCancel?: () => void;
}

export function LoadingScreen({ label, progress, onCancel }: Props) {
  const percent = progress === undefined ? undefined : Math.min(100, Math.max(0, progress));
  return (
    <div
      className="folio-loading"
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="document-loading"
    >
      <div className="loading-center">
        <div className="loading-mark" aria-hidden="true">
          <div className="loading-orbit">
            <svg viewBox="0 0 80 80" fill="none">
              <circle className="loading-track" cx="40" cy="40" r="32" />
              <circle className="loading-arc" cx="40" cy="40" r="32" />
            </svg>
          </div>
        </div>
        <div className="loading-caption">{label}</div>
        {percent !== undefined && (
          <div
            className="loading-progress"
            role="progressbar"
            aria-label="文档准备进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        )}
        {onCancel && (
          <button className="loading-cancel" onClick={onCancel} aria-label="取消当前操作">
            取消加载
          </button>
        )}
      </div>
      <div className="loading-brand">
        <span className="loading-brand-icon" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 1254 1254" fill="none">
            <path
              fill="#4262FB"
              d="M405 225H666C698 225 722 234 744 256L875 388C899 412 910 433 910 468V907C910 970 858 1022 795 1022H406C340 1022 287 969 287 903V343C287 278 340 225 405 225Z"
            />
            <path
              fill="#FFFFFF"
              d="M676 291C676 280 689 275 697 283L848 435C856 443 852 456 840 456H744C704 456 676 428 676 388Z"
            />
            <g fill="#FFFFFF">
              <rect x="376" y="503" width="285" height="52" rx="26" />
              <rect x="376" y="598" width="205" height="52" rx="26" />
              <rect x="376" y="839" width="183" height="52" rx="26" />
            </g>
            <circle cx="788" cy="797" r="191" fill="#4262FB" stroke="#FFFFFF" strokeWidth="36" />
            <path
              d="M742 740L791 705V871M748 871H834"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="42"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <strong>
          Folio<span>PDF 标注工作台</span>
        </strong>
      </div>
    </div>
  );
}
