/**
 * Video Stability Assistant – StabilityGauge Component
 *
 * Renders an animated SVG arc gauge representing the overall stability
 * score (0–100).  Arc colour transitions through the full stability
 * spectrum and the needle animates smoothly on value change.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import React, { useMemo } from 'react';
import type { StabilityLevel } from '../types';
import { levelToColor, levelToLabel } from '../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StabilityGaugeProps {
  /** Composite score in [0, 100]. */
  score: number;
  level: StabilityLevel;
  /** Diameter of the gauge in pixels (default: 160). */
  size?: number;
  /** Whether to show the numeric score inside the arc. */
  showScore?: boolean;
  /** Whether to show the level label below the score. */
  showLabel?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Geometry Helpers
// ---------------------------------------------------------------------------

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const [sx, sy] = polarToCartesian(cx, cy, radius, startAngle);
  const [ex, ey] = polarToCartesian(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GAUGE_START_ANGLE = -140;
const GAUGE_END_ANGLE = 140;
const GAUGE_TOTAL_SWEEP = GAUGE_END_ANGLE - GAUGE_START_ANGLE; // 280°

export const StabilityGauge: React.FC<StabilityGaugeProps> = ({
  score,
  level,
  size = 160,
  showScore = true,
  showLabel = true,
  className = '',
}) => {
  const normalised = Math.max(0, Math.min(100, score));
  const color = levelToColor(level);
  const label = levelToLabel(level);

  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = size * 0.09;
  const radius = (size - strokeWidth * 2) / 2;

  const { trackPath, fillPath } = useMemo(() => {
    const track = describeArc(cx, cy, radius, GAUGE_START_ANGLE, GAUGE_END_ANGLE);

    const fillAngle =
      GAUGE_START_ANGLE + (normalised / 100) * GAUGE_TOTAL_SWEEP;
    // Ensure fill arc is never degenerate (min 1° so SVG renders it).
    const clampedFill = Math.max(GAUGE_START_ANGLE + 1, fillAngle);
    const fill = describeArc(cx, cy, radius, GAUGE_START_ANGLE, clampedFill);

    return { trackPath: track, fillPath: fill };
  }, [cx, cy, radius, normalised]);

  const fontSize = size * 0.22;
  const labelFontSize = size * 0.1;

  return (
    <div
      className={`vsa-gauge ${className}`}
      style={{ width: size, height: size, position: 'relative', display: 'inline-block' }}
      role="img"
      aria-label={`Stability ${label}, score ${normalised} out of 100`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        overflow="visible"
      >
        {/* Track (background arc) */}
        <path
          d={trackPath}
          fill="none"
          stroke="var(--vsa-gauge-track, #e5e7eb)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Fill arc (animated via CSS transition on stroke-dasharray) */}
        <path
          d={fillPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dasharray 0.6s ease, stroke 0.4s ease, d 0.6s ease',
            filter: `drop-shadow(0 0 ${strokeWidth * 0.4}px ${color}66)`,
          }}
        />

        {/* Score text */}
        {showScore && (
          <text
            x={cx}
            y={cy + fontSize * 0.35}
            textAnchor="middle"
            fontSize={fontSize}
            fontWeight="700"
            fontFamily="inherit"
            fill="var(--vsa-text-primary, #111827)"
            style={{ transition: 'fill 0.4s ease' }}
          >
            {normalised}
          </text>
        )}

        {/* "/100" sub-label */}
        {showScore && (
          <text
            x={cx}
            y={cy + fontSize * 0.35 + labelFontSize * 1.4}
            textAnchor="middle"
            fontSize={labelFontSize * 0.85}
            fontFamily="inherit"
            fill="var(--vsa-text-muted, #6b7280)"
          >
            /100
          </text>
        )}

        {/* Level label */}
        {showLabel && (
          <text
            x={cx}
            y={size - strokeWidth * 0.4}
            textAnchor="middle"
            fontSize={labelFontSize}
            fontWeight="600"
            fontFamily="inherit"
            fill={color}
            style={{ transition: 'fill 0.4s ease' }}
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  );
};

export default StabilityGauge;
