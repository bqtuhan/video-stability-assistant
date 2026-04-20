/**
 * Video Stability Assistant – BufferBar Component
 *
 * Renders a segmented horizontal bar visualising buffer-ahead health.
 * The bar transitions through colour zones: critical (red) → warning
 * (orange/yellow) → healthy (green).
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import React from 'react';

interface BufferBarProps {
  /** Seconds of content buffered ahead of current playback position. */
  bufferAheadS: number;
  /** Maximum seconds to represent at full width (default: 30). */
  maxS?: number;
  /** Height of the bar in pixels (default: 10). */
  height?: number;
  /** Whether to show the numeric label (default: true). */
  showLabel?: boolean;
  className?: string;
}

export const BufferBar: React.FC<BufferBarProps> = ({
  bufferAheadS,
  maxS = 30,
  height = 10,
  showLabel = true,
  className = '',
}) => {
  const pct = Math.min(100, Math.max(0, (bufferAheadS / maxS) * 100));

  const color =
    bufferAheadS < 2
      ? '#ef4444'
      : bufferAheadS < 8
      ? '#f97316'
      : bufferAheadS < 15
      ? '#eab308'
      : '#22c55e';

  const segmentCount = 20;
  const filledSegments = Math.round((pct / 100) * segmentCount);

  return (
    <div
      className={`vsa-buffer-bar ${className}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      {showLabel && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--vsa-text-muted, #6b7280)',
          }}
        >
          <span>Buffer</span>
          <span style={{ fontWeight: 600, color }}>
            {bufferAheadS.toFixed(1)}s
          </span>
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={Math.round(bufferAheadS)}
        aria-valuemin={0}
        aria-valuemax={maxS}
        aria-label={`Buffer: ${bufferAheadS.toFixed(1)} seconds`}
        style={{
          display: 'flex',
          gap: 2,
          height,
        }}
      >
        {Array.from({ length: segmentCount }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: 2,
              backgroundColor:
                i < filledSegments
                  ? color
                  : 'var(--vsa-gauge-track, #e5e7eb)',
              transition: 'background-color 0.4s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================

/**
 * MetricCard – displays a single labelled metric value with an optional
 * sub-label and colour indicator.
 */
interface MetricCardProps {
  label: string;
  value: string;
  subLabel?: string;
  color?: string;
  /** Whether this card represents a healthy/neutral/warning state. */
  status?: 'healthy' | 'neutral' | 'warning' | 'critical';
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subLabel,
  color,
  status = 'neutral',
  className = '',
}) => {
  const statusColors: Record<string, string> = {
    healthy: '#22c55e',
    neutral: 'var(--vsa-text-muted, #6b7280)',
    warning: '#f97316',
    critical: '#ef4444',
  };

  const displayColor = color ?? statusColors[status];

  return (
    <div
      className={`vsa-metric-card ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--vsa-card-bg, #f9fafb)',
        border: '1px solid var(--vsa-card-border, #e5e7eb)',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--vsa-text-muted, #6b7280)',
        }}
      >
        {label}
      </span>

      <span
        style={{
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1.15,
          color: displayColor,
          transition: 'color 0.3s ease',
        }}
      >
        {value}
      </span>

      {subLabel && (
        <span
          style={{
            fontSize: 10,
            color: 'var(--vsa-text-muted, #6b7280)',
          }}
        >
          {subLabel}
        </span>
      )}
    </div>
  );
};

// ============================================================================

/**
 * AdvisoryPanel – renders a vertical list of advisory cards, each showing
 * severity, title, description, and a collapsible action list.
 */
import type { Advisory } from '../types';

interface AdvisoryPanelProps {
  advisories: Advisory[];
  className?: string;
}

const SEVERITY_META = {
  critical: { icon: '🔴', label: 'Critical', color: '#ef4444', bg: '#fef2f2' },
  warning: { icon: '🟡', label: 'Warning', color: '#f97316', bg: '#fff7ed' },
  info: { icon: '🔵', label: 'Info', color: '#3b82f6', bg: '#eff6ff' },
};

export const AdvisoryPanel: React.FC<AdvisoryPanelProps> = ({
  advisories,
  className = '',
}) => {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) { next.delete(code); } else { next.add(code); }
      return next;
    });
  };

  if (advisories.length === 0) {
    return (
      <div
        className={`vsa-advisory-panel ${className}`}
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'var(--vsa-card-bg, #f9fafb)',
          border: '1px solid var(--vsa-card-border, #e5e7eb)',
          textAlign: 'center',
          color: 'var(--vsa-text-muted, #6b7280)',
          fontSize: 13,
        }}
      >
        No advisories at this time.
      </div>
    );
  }

  return (
    <div
      className={`vsa-advisory-panel ${className}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {advisories.map((advisory) => {
        const meta = SEVERITY_META[advisory.severity];
        const isOpen = expanded.has(advisory.code);

        return (
          <div
            key={advisory.code}
            style={{
              borderRadius: 10,
              border: `1px solid ${meta.color}44`,
              background: meta.bg,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <button
              onClick={() => toggle(advisory.code)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              aria-expanded={isOpen}
            >
              <span style={{ fontSize: 14 }}>{meta.icon}</span>
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 600,
                  color: meta.color,
                }}
              >
                {advisory.title}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: meta.color,
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                  userSelect: 'none',
                }}
              >
                ▼
              </span>
            </button>

            {/* Body */}
            {isOpen && (
              <div
                style={{
                  padding: '0 12px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: 'var(--vsa-text-secondary, #374151)',
                  }}
                >
                  {advisory.description}
                </p>

                {advisory.actions.length > 0 && (
                  <div>
                    <p
                      style={{
                        margin: '0 0 4px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--vsa-text-muted, #6b7280)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Suggested Actions
                    </p>
                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      {advisory.actions.map((action, i) => (
                        <li
                          key={i}
                          style={{
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: 'var(--vsa-text-secondary, #374151)',
                          }}
                        >
                          {action}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
