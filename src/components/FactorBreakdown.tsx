/**
 * Video Stability Assistant – FactorBreakdown Component
 *
 * Renders a vertical list of mini progress bars showing the five
 * individual factor scores that comprise the composite stability score.
 * Each bar is labelled, coloured by its score tier, and optionally
 * annotated with the weight applied in the current playback mode.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import React from 'react';
import type { ScoreFactors, ScoringWeights } from '../types';
import { scoreToLevel, levelToColor } from '../utils';

// ---------------------------------------------------------------------------
// FactorBreakdown
// ---------------------------------------------------------------------------

interface FactorBreakdownProps {
  factors: ScoreFactors;
  weights?: ScoringWeights;
  className?: string;
}

const FACTOR_LABELS: Record<keyof ScoreFactors, string> = {
  bufferHealth: 'Buffer Health',
  dropRate: 'Frame Drop Rate',
  stallFrequency: 'Stall Frequency',
  bitrateStability: 'Bitrate Stability',
  decodePerformance: 'Decode Performance',
};

export const FactorBreakdown: React.FC<FactorBreakdownProps> = ({
  factors,
  weights,
  className = '',
}) => {
  const entries = Object.entries(factors) as [keyof ScoreFactors, number][];

  return (
    <div
      className={`vsa-factor-breakdown ${className}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {entries.map(([key, score]) => {
        const level = scoreToLevel(score);
        const color = levelToColor(level);
        const weight = weights ? weights[key] : null;

        return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Label row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--vsa-text-secondary, #374151)',
                  fontWeight: 500,
                }}
              >
                {FACTOR_LABELS[key]}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {weight !== null && (
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--vsa-text-muted, #9ca3af)',
                      fontWeight: 500,
                    }}
                  >
                    ×{(weight * 100).toFixed(0)}%
                  </span>
                )}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color,
                    minWidth: 28,
                    textAlign: 'right',
                  }}
                >
                  {score}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div
              role="progressbar"
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${FACTOR_LABELS[key]}: ${score}`}
              style={{
                height: 6,
                borderRadius: 3,
                background: 'var(--vsa-gauge-track, #e5e7eb)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score}%`,
                  borderRadius: 3,
                  backgroundColor: color,
                  transition: 'width 0.5s ease, background-color 0.4s ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
