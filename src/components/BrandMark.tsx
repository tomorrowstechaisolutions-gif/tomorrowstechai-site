import type { CSSProperties } from "react";

export function BrandMark({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`brand-mark ${className}`.trim()}
      style={{ "--brand-mark-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <span className="brand-mark-cap brand-mark-cap-left" />
      <span className="brand-mark-stem brand-mark-stem-left" />
      <span className="brand-mark-cap brand-mark-cap-right" />
      <span className="brand-mark-stem brand-mark-stem-right" />
    </span>
  );
}
