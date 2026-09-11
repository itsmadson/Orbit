"use client";

import { cn } from "@/lib/utils";

/**
 * The product mark, in motion.
 *
 * ORBIT's logo is already an orbit — a core with two tilted rings — so work in
 * progress is shown by putting satellites on those rings rather than by
 * borrowing a generic spinner. The two periods are deliberately not harmonic, so
 * the satellites drift in and out of alignment instead of marching in step.
 */
export function OrbitLoader({
  size = 44,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="status"
      aria-label="Loading"
      className={cn("orbit-loader shrink-0", className)}
    >
      <defs>
        <radialGradient id="orbit-core">
          <stop offset="0%" stopColor="var(--accent-hot)" />
          <stop offset="100%" stopColor="var(--accent-solid)" />
        </radialGradient>
        {/* A gradient that fades to nothing, not a blur filter: it renders the
            same everywhere and needs no filter support. */}
        <radialGradient id="orbit-halo-fill">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.38" />
          <stop offset="45%" stopColor="var(--accent)" stopOpacity="0.13" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="24" cy="24" r="13" className="orbit-halo" fill="url(#orbit-halo-fill)" />
      <circle cx="24" cy="24" r="5" fill="url(#orbit-core)" />

      <g transform="rotate(-28 24 24)">
        <ellipse
          cx="24"
          cy="24"
          rx="20"
          ry="9.5"
          stroke="var(--accent)"
          strokeOpacity="0.42"
          strokeWidth="1.4"
        />
        <circle r="2.6" fill="var(--accent-hot)" className="orbit-sat orbit-sat-a" />
      </g>

      <g transform="rotate(38 24 24)">
        <ellipse
          cx="24"
          cy="24"
          rx="20"
          ry="9.5"
          stroke="var(--text)"
          strokeOpacity="0.22"
          strokeWidth="1.2"
        />
        <circle r="1.9" fill="var(--text)" fillOpacity="0.55" className="orbit-sat orbit-sat-b" />
      </g>
    </svg>
  );
}

/** A centred panel for a surface that has nothing to show yet. */
export function OrbitLoading({
  label,
  className,
  size = 52,
}: {
  label?: string;
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-center",
        className,
      )}
    >
      <OrbitLoader size={size} />
      {label ? <p className="text-[12px] text-muted">{label}</p> : null}
    </div>
  );
}
