export function middleEllipsis(value: string, keep: number) {
  const chars = Array.from(value);
  if (chars.length <= keep) return value;
  if (keep <= 0) return '…';
  const left = Math.ceil(keep * 0.55),
    right = keep - left;
  return chars.slice(0, left).join('') + '…' + (right ? chars.slice(-right).join('') : '');
}
