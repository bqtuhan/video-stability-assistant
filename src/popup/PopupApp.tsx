/**
 * Video Stability Assistant – Popup Application
 *
 * The primary user interface displayed when the extension icon is clicked.
 * All data is sourced from the service worker via chrome.runtime.sendMessage —
 * no simulated or static data is used.
 *
 * UI Sections
 * ───────────
 * 1. Header       – Extension name, settings link, and last-updated timestamp.
 * 2. Gauge        – Animated stability score gauge with level label.
 * 3. Metrics Grid – Buffer bar, bitrate, drop rate, and decode time cards.
 * 4. Factor Panel – Collapsible 5-factor score breakdown.
 * 5. Prediction   – Freeze-risk banner (shown when enablePrediction is on).
 * 6. Advisories   – Collapsible advisory list.
 *
 * Responsiveness: The popup is designed for a fixed 360 px width (Chrome
 * default) and scales correctly down to 320 px for narrow viewports.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type TabState,
  type ExtensionSettings,
  type ExtensionMessage,
} from '../types';
import {
  StabilityGauge,
  BufferBar,
  MetricCard,
  AdvisoryPanel,
  FactorBreakdown,
  PredictionBanner,
} from '../components';
import {
  formatBitrate,
  levelToColor,
  round,
} from '../utils';

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 1500;

// ---------------------------------------------------------------------------
// Custom Hook – Extension State
// ---------------------------------------------------------------------------

interface UseExtensionStateResult {
  tabState: TabState | null;
  settings: ExtensionSettings;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function useExtensionState(): UseExtensionStateResult {
  const [tabState, setTabState] = useState<TabState | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings>({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    try {
      const [stateResp, settingsResp] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_TAB_STATE' } as ExtensionMessage),
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' } as ExtensionMessage),
      ]);

      if (stateResp?.type === 'TAB_STATE_RESPONSE') {
        setTabState(stateResp.payload ?? null);
      }
      if (settingsResp?.type === 'SETTINGS_RESPONSE') {
        setSettings(settingsResp.payload);
      }

      setError(null);
    } catch {
      setError(chrome.i18n.getMessage('errorReachBackground') || 'Unable to reach the extension background.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
    pollRef.current = setInterval(() => void fetch(), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current !== null) {clearInterval(pollRef.current);}
    };
  }, [fetch]);

  return { tabState, settings, loading, error, refresh: () => { void fetch(); } };
}

// ---------------------------------------------------------------------------
// Section – No Video State
// ---------------------------------------------------------------------------

const NoVideoState: React.FC = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: '32px 20px',
      textAlign: 'center',
    }}
  >
    <span style={{ fontSize: 40 }}>🎬</span>
    <p
      style={{
        margin: 0,
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--vsa-text-primary, #111827)',
      }}
    >
      {chrome.i18n.getMessage('noVideoDetected') || 'No video detected'}
    </p>
    <p
      style={{
        margin: 0,
        fontSize: 12,
        color: 'var(--vsa-text-muted, #6b7280)',
        maxWidth: 240,
        lineHeight: 1.5,
      }}
    >
      {chrome.i18n.getMessage('noVideoDescription') || 'Navigate to a page with a playing video to begin monitoring stability.'}
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Section – Error State
// ---------------------------------------------------------------------------

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({
  message,
  onRetry,
}) => (
  <div
    style={{
      padding: '24px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      alignItems: 'center',
      textAlign: 'center',
    }}
  >
    <span style={{ fontSize: 32 }}>⚠️</span>
    <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{message}</p>
    <button
      onClick={onRetry}
      style={{
        padding: '8px 20px',
        borderRadius: 8,
        border: 'none',
        background: '#3b82f6',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {chrome.i18n.getMessage('btnRetry') || 'Retry'}
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Main Popup Component
// ---------------------------------------------------------------------------

const PopupApp: React.FC = () => {
  const { tabState, settings, loading, error, refresh } = useExtensionState();
  const [showFactors, setShowFactors] = useState(false);

  const openOptions = () => {
    void chrome.runtime.openOptionsPage();
  };

  // Theme detection (respects system preference and user setting).
  const prefersDark =
    settings.theme === 'dark' ||
    (settings.theme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const cssVars = prefersDark
    ? {
        '--vsa-bg': '#111827',
        '--vsa-card-bg': '#1f2937',
        '--vsa-card-border': '#374151',
        '--vsa-text-primary': '#f9fafb',
        '--vsa-text-secondary': '#e5e7eb',
        '--vsa-text-muted': '#9ca3af',
        '--vsa-gauge-track': '#374151',
        '--vsa-divider': '#1f2937',
      }
    : {
        '--vsa-bg': '#ffffff',
        '--vsa-card-bg': '#f9fafb',
        '--vsa-card-border': '#e5e7eb',
        '--vsa-text-primary': '#111827',
        '--vsa-text-secondary': '#374151',
        '--vsa-text-muted': '#6b7280',
        '--vsa-gauge-track': '#e5e7eb',
        '--vsa-divider': '#f3f4f6',
      };

  const { metrics, score, advisories, prediction } = tabState ?? {};
  const hasVideo = !!metrics && !!score;

  // Helper for translations
  const t = (key: string) => chrome.i18n.getMessage(key) || key;

  return (
    <div
      style={{
        width: 360,
        minHeight: 480,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: 'var(--vsa-bg)',
        color: 'var(--vsa-text-primary)',
        ...(cssVars as React.CSSProperties),
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 10px',
          borderBottom: '1px solid var(--vsa-card-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src={chrome.runtime.getURL('icons/icon32.png')}
            width={20}
            height={20}
            alt=""
            style={{ borderRadius: 4 }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--vsa-text-primary)',
            }}
          >
            {t('extensionName')}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { void refresh(); }}
            title={t('btnRefresh')}
            style={iconBtnStyle}
            aria-label="Refresh metrics"
          >
            ↻
          </button>
          <button
            onClick={openOptions}
            title={t('btnSettings')}
            style={iconBtnStyle}
            aria-label="Open settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ padding: '16px 16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && !tabState ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !hasVideo ? (
          <NoVideoState />
        ) : (
          <>
            {/* ── Gauge Section ── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <StabilityGauge
                score={score.overall}
                level={score.level}
                size={130}
                showScore
                showLabel
              />

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Mode badge */}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--vsa-text-muted)',
                  }}
                >
                  {t('labelMode')}: {settings.playbackMode}
                </span>

                {/* Stall count */}
                <div>
                  <span style={{ fontSize: 11, color: 'var(--vsa-text-muted)' }}>
                    {t('labelStalls')}:{' '}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: metrics.stallCount > 0 ? '#ef4444' : '#22c55e',
                    }}
                  >
                    {metrics.stallCount}
                  </span>
                </div>

                <button
                  onClick={() => setShowFactors(!showFactors)}
                  style={{
                    marginTop: 4,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--vsa-card-border)',
                    background: 'var(--vsa-card-bg)',
                    color: 'var(--vsa-text-secondary)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  {showFactors ? t('btnHideDetails') : t('btnShowDetails')}
                </button>
              </div>
            </div>

            {showFactors && (
              <FactorBreakdown factors={score.factors} />
            )}

            <BufferBar bufferAheadS={metrics.bufferAhead} />

            {/* ── Metrics Grid ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <MetricCard
                label={t('labelBitrate')}
                value={formatBitrate(metrics.bitrate)}
                subLabel={t('subLabelCurrent')}
                status={
                  metrics.bitrate > 0 && metrics.bandwidth > 0
                    ? metrics.bitrate > metrics.bandwidth
                      ? 'warning'
                      : 'healthy'
                    : 'neutral'
                }
              />
              <MetricCard
                label={t('labelBandwidth')}
                value={
                  metrics.bandwidth > 0 ? formatBitrate(metrics.bandwidth) : '—'
                }
                subLabel={t('subLabelAvailable')}
                status="neutral"
              />
              <MetricCard
                label={t('labelDropRate')}
                value={
                  metrics.totalFrames > 0
                    ? `${round(
                        (metrics.droppedFrames / metrics.totalFrames) * 100,
                        1,
                      )}%`
                    : '0%'
                }
                subLabel={`${metrics.droppedFrames} frames`}
                status={
                  metrics.totalFrames > 0 &&
                  (metrics.droppedFrames / metrics.totalFrames) * 100 >= 5
                    ? 'warning'
                    : 'healthy'
                }
              />
              <MetricCard
                label={t('labelDecodeTime')}
                value={
                  metrics.decodeTime > 0
                    ? `${round(metrics.decodeTime, 1)} ms`
                    : '—'
                }
                subLabel={t('subLabelAvgPerFrame')}
                status={
                  metrics.decodeTime > 50
                    ? 'warning'
                    : metrics.decodeTime > 0
                    ? 'healthy'
                    : 'neutral'
                }
              />
            </div>

            {/* ── Advanced Metrics ── */}
            {settings.showAdvancedMetrics && (
              <section aria-label="Advanced metrics">
                <SectionTitle>{t('settingsAdvanced')}</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <MetricCard
                    label="Buffer Behind"
                    value={`${metrics.bufferBehind.toFixed(1)}s`}
                    subLabel="cached behind"
                    status="neutral"
                  />
                  <MetricCard
                    label="Ready State"
                    value={String(metrics.readyState)}
                    subLabel={readyStateLabel(metrics.readyState)}
                    status={metrics.readyState < 3 ? 'warning' : 'healthy'}
                  />
                  <MetricCard
                    label="Playback Rate"
                    value={`${metrics.playbackRate}×`}
                    subLabel={metrics.playbackRate > 1.5 ? 'fast-forward' : 'normal'}
                    status={metrics.playbackRate > 1.5 ? 'warning' : 'neutral'}
                  />
                  <MetricCard
                    label="Stall Duration"
                    value={`${round(metrics.totalStallDuration / 1000, 1)}s`}
                    subLabel="total this session"
                    status={metrics.totalStallDuration > 5000 ? 'warning' : 'neutral'}
                  />
                </div>
              </section>
            )}

            {/* ── Freeze Prediction ── */}
            {settings.enablePrediction && prediction && (
              <section aria-label="Freeze prediction">
                <SectionTitle>{t('labelFreezePrediction')}</SectionTitle>
                <PredictionBanner prediction={prediction} />
              </section>
            )}

            {/* ── Advisories ── */}
            {advisories && advisories.length > 0 && (
              <section aria-label="Advisories">
                <SectionTitle>
                  {t('labelAdvisories')}
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      background: levelToColor(score.level),
                      color: '#fff',
                      borderRadius: 10,
                      padding: '1px 7px',
                    }}
                  >
                    {advisories.length}
                  </span>
                </SectionTitle>
                <AdvisoryPanel advisories={advisories} />
              </section>
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <footer
        style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--vsa-card-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--vsa-text-muted)' }}>
          v{chrome.runtime.getManifest().version}
        </span>
        <a
          href="https://github.com/bqtuhan/video-stability-assistant"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 10,
            color: 'var(--vsa-text-muted)',
            textDecoration: 'none',
          }}
        >
          GitHub
        </a>
      </footer>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Internal Layout Sub-components
// ---------------------------------------------------------------------------

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid var(--vsa-card-border)',
  background: 'var(--vsa-card-bg)',
  color: 'var(--vsa-text-secondary)',
  fontSize: 14,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  padding: 0,
};

const SectionTitle: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h2
    style={{
      margin: '0 0 8px',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      color: 'var(--vsa-text-muted)',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    }}
  >
    {children}
  </h2>
);

const LoadingSpinner: React.FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 160,
    }}
  >
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '3px solid var(--vsa-gauge-track)',
        borderTopColor: '#3b82f6',
        animation: 'vsa-spin 0.8s linear infinite',
      }}
    />
    <style>{`@keyframes vsa-spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

function readyStateLabel(state: number): string {
  const labels: Record<number, string> = {
    0: 'HAVE_NOTHING',
    1: 'HAVE_METADATA',
    2: 'HAVE_CURRENT_DATA',
    3: 'HAVE_FUTURE_DATA',
    4: 'HAVE_ENOUGH_DATA',
  };
  return labels[state] ?? 'UNKNOWN';
}

export default PopupApp;
