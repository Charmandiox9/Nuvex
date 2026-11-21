export function Skeleton({ width, height = 14, rounded = 8 }: { width?: number | string; height?: number | string; rounded?: number }) {
  return <span className="skeleton" style={{ width, height, borderRadius: rounded }} aria-hidden="true" />;
}
