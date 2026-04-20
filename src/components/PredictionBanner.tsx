/**
 * Video Stability Assistant – PredictionBanner Component
 *
 * Displays the freeze-prediction result as a contextual banner.
 * When no freeze is predicted the banner shows a positive confirmation.
 * When a freeze is imminent the banner presents probability, time estimate,
 * and confidence tier in a visually prominent warning layout.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import React from 'react';
import type { PredictionResult } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PredictionBannerProps {
  prediction: PredictionResult;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PredictionBanner: React.FC<PredictionBannerProps> = ({
  prediction,
  className = '',
}) => {
  const { willFreeze, probability, estimatedSecondsUntilFreeze, confidence } =
    prediction;

  const confidenceLabel: Record<string, string> = {
    low: 'Low confidence',
    medium: 'Medium confidence',
    high: 'High confidence',
  };

  if (!willFreeze) {
    return (
      <div
        className={`vsa-prediction-banner vsa-prediction-banner--safe ${className}`}
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 10,
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
        }}
      >
        <span style={{ fontSize: 18 }}>✅</span>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: '#15803d',
            }}
          >
            No Freeze Predicted
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: '#16a34a',
            }}
          >
            Probability: {Math.round(probability * 100)}% — {confidenceLabel[confidence]}
          </p>
        </div>
      </div>
    );
  }

  const pctDisplay = Math.round(probability * 100);
  const timeDisplay =
    estimatedSecondsUntilFreeze !== null
      ? `~${estimatedSecondsUntilFreeze}s`
      : 'imminent';

  const urgencyColor =
    probability >= 0.8 ? '#ef4444' : probability >= 0.65 ? '#f97316' : '#eab308';
  const urgencyBg =
    probability >= 0.8 ? '#fef2f2' : probability >= 0.65 ? '#fff7ed' : '#fefce8';
  const urgencyBorder =
    probability >= 0.8 ? '#fecaca' : probability >= 0.65 ? '#fed7aa' : '#fef08a';

  return (
    <div
      className={`vsa-prediction-banner vsa-prediction-banner--warn ${className}`}
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 10,
        background: urgencyBg,
        border: `1px solid ${urgencyBorder}`,
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <p
          style={{
            margin: '0 0 4px',
            fontSize: 13,
            fontWeight: 700,
            color: urgencyColor,
          }}
        >
          Freeze Risk Detected
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px 12px',
          }}
        >
          <Stat label="Probability" value={`${pctDisplay}%`} color={urgencyColor} />
          <Stat label="Est. Time" value={timeDisplay} color={urgencyColor} />
          <Stat
            label="Confidence"
            value={confidence.charAt(0).toUpperCase() + confidence.slice(1)}
            color="var(--vsa-text-muted, #6b7280)"
          />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Internal Sub-component
// ---------------------------------------------------------------------------

interface StatProps {
  label: string;
  value: string;
  color: string;
}

const Stat: React.FC<StatProps> = ({ label, value, color }) => (
  <div>
    <p style={{ margin: 0, fontSize: 9, color: 'var(--vsa-text-muted, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </p>
    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color }}>
      {value}
    </p>
  </div>
);
