import { memo } from 'react';
import type { MarkerStyle } from '../types';
export const MarkerGlyph = memo(function MarkerGlyph({
  style,
  number,
}: {
  style: MarkerStyle;
  number: number;
}) {
  const bw = style.borderColor ? style.borderWidth : 0,
    size = style.size;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={Math.max(0, (size - bw) / 2)}
        fill={style.fillColor ?? 'none'}
        stroke={bw ? style.borderColor! : 'none'}
        strokeWidth={bw}
      />
      <text
        x={size / 2}
        y={size / 2 + style.textSize * 0.358}
        textAnchor="middle"
        fontFamily="Arial,Helvetica,sans-serif"
        fontWeight="700"
        fontSize={style.textSize}
        fill={style.textColor}
      >
        {number}
      </text>
    </svg>
  );
});
