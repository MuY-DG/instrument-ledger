export function DockIcon({ direction }: { direction: 'right' | 'top' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.3" stroke="currentColor" strokeWidth="1.5" />
      {direction === 'right' ? (
        <rect x="13" y="5.5" width="6.5" height="13" rx=".7" fill="currentColor" />
      ) : (
        <rect x="4.5" y="5.5" width="15" height="5" rx=".7" fill="currentColor" />
      )}
    </svg>
  );
}
