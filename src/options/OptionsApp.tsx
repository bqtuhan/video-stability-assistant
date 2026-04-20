/**
 * Video Stability Assistant – Options Page Application
 *
 * Full-page settings interface that reads from and writes to
 * chrome.storage.sync via the service worker.  No simulated data
 * is present — all displayed values reflect live extension state.
 *
 * Settings Sections
 * ──────────────────
 * 1. Playback Mode      – Balanced / Live / VOD preset selection.
 * 2. Scoring Weights    – Read-only weight display for the active mode.
 * 3. Notifications      – Enable / threshold / permissions.
 * 4. Collection         – Sampling interval.
 * 5. Site Allowlist     – Per-hostname enable/disable controls.
 * 6. Advanced           – Prediction toggle, advanced metrics display.
 * 7. Appearance         – Light / dark / auto theme selection.
 * 8. Danger Zone        – Reset to defaults.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
  type ExtensionMessage,
  type PlaybackMode,
  type StabilityLevel,
} from '../types';
import { getWeights } from '../engines/scoring';
import { shallowMerge } from '../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ---------------------------------------------------------------------------
// Hook – Settings State
// ---------------------------------------------------------------------------

function useSettings() {
  const [settings, setSettings] = useState<ExtensionSettings>({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const load = useCallback(async () => {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'GET_SETTINGS',
      } as ExtensionMessage);
      if (resp?.type === 'SETTINGS_RESPONSE') {
        setSettings(resp.payload);
      }
    } catch {
      /* background may be waking up */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (patch: Partial<ExtensionSettings>) => {
    setSaveStatus('saving');
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: patch,
      } as ExtensionMessage);
      if (resp?.type === 'SETTINGS_UPDATED') {
        setSettings(resp.payload);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }, []);

  const reset = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'RESET_SETTINGS',
      } as ExtensionMessage);
      if (resp?.type === 'SETTINGS_UPDATED') {
        setSettings(resp.payload);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }, []);

  const patch = useCallback(
    (partial: Partial<ExtensionSettings>) => {
      const updated = shallowMerge(settings, partial);
      setSettings(updated);
      void save(partial);
    },
    [settings, save],
  );

  return { settings, loading, saveStatus, patch, reset };
}

// ---------------------------------------------------------------------------
// Main Options Component
// ---------------------------------------------------------------------------

const OptionsApp: React.FC = () => {
  const { settings, loading, saveStatus, patch, reset } = useSettings();
  const [newSite, setNewSite] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const weights = getWeights(settings.playbackMode);

  if (loading) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: '#6b7280' }}>Loading settings…</p>
      </div>
    );
  }

  const addSite = () => {
    const trimmed = newSite.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!trimmed || settings.enabledSites.includes(trimmed)) {
      setNewSite('');
      return;
    }
    patch({ enabledSites: [...settings.enabledSites, trimmed] });
    setNewSite('');
  };

  const removeSite = (site: string) => {
    patch({ enabledSites: settings.enabledSites.filter((s) => s !== site) });
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>

        {/* ── Page Header ── */}
        <header style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <img src={chrome.runtime.getURL('icons/icon48.png')} width={32} height={32} alt="" style={{ borderRadius: 6 }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
              Video Stability Assistant
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
            v{chrome.runtime.getManifest().version} · Settings
          </p>
        </header>

        {/* Save status banner */}
        {saveStatus !== 'idle' && (
          <div style={{
            marginBottom: 20,
            padding: '10px 16px',
            borderRadius: 8,
            background: saveStatus === 'saved' ? '#f0fdf4' : saveStatus === 'error' ? '#fef2f2' : '#eff6ff',
            border: `1px solid ${saveStatus === 'saved' ? '#bbf7d0' : saveStatus === 'error' ? '#fecaca' : '#bfdbfe'}`,
            fontSize: 13,
            fontWeight: 500,
            color: saveStatus === 'saved' ? '#15803d' : saveStatus === 'error' ? '#dc2626' : '#1d4ed8',
          }}>
            {saveStatus === 'saving' ? '⏳ Saving…' : saveStatus === 'saved' ? '✅ Settings saved.' : '❌ Save failed. Please try again.'}
          </div>
        )}

        {/* ── Section: Playback Mode ── */}
        <Section title="Playback Mode" description="Select the scoring-weight preset that matches your viewing context.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {(['balanced', 'live', 'vod'] as PlaybackMode[]).map((mode) => {
              const labels = { balanced: '⚖️ Balanced', live: '📡 Live', vod: '🎬 VOD' };
              const descs = {
                balanced: 'General-purpose. Equal emphasis across all factors.',
                live: 'Prioritises low-latency and stall prevention for live streams.',
                vod: 'Emphasises drop rate and bitrate consistency for long-form content.',
              };
              const isActive = settings.playbackMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => patch({ playbackMode: mode })}
                  style={{
                    padding: '12px 10px',
                    borderRadius: 10,
                    border: isActive ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                    background: isActive ? '#eff6ff' : '#f9fafb',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: isActive ? '#1d4ed8' : '#111827' }}>
                    {labels[mode]}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                    {descs[mode]}
                  </p>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Section: Scoring Weights ── */}
        <Section title="Active Scoring Weights" description={`Weight distribution for "${settings.playbackMode}" mode. Weights must sum to 100%.`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.entries(weights) as [string, number][]).map(([key, w]) => {
              const labels: Record<string, string> = {
                bufferHealth: 'Buffer Health',
                dropRate: 'Frame Drop Rate',
                stallFrequency: 'Stall Frequency',
                bitrateStability: 'Bitrate Stability',
                decodePerformance: 'Decode Performance',
              };
              const pct = Math.round(w * 100);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: '#374151', width: 160, flexShrink: 0 }}>{labels[key]}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#e5e7eb', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6', borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', width: 36, textAlign: 'right' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Section: Notifications ── */}
        <Section title="Notifications" description="Configure desktop notifications for stability events.">
          <ToggleRow
            label="Enable desktop notifications"
            description="Show system notifications when stability drops below the threshold."
            checked={settings.enableNotifications}
            onChange={(v) => patch({ enableNotifications: v })}
          />

          {settings.enableNotifications && (
            <div style={{ marginTop: 16 }}>
              <Label>Notification threshold</Label>
              <p style={descStyle}>Notifications fire when the stability level is at or below this value.</p>
              <select
                value={settings.notificationThreshold}
                onChange={(e) => patch({ notificationThreshold: e.target.value as StabilityLevel })}
                style={selectStyle}
              >
                <option value="excellent">Excellent (always notify)</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor (recommended)</option>
                <option value="critical">Critical only</option>
              </select>
            </div>
          )}
        </Section>

        {/* ── Section: Sampling ── */}
        <Section title="Metrics Collection" description="Controls how frequently metrics are sampled from the video element.">
          <Label>Sampling interval</Label>
          <p style={descStyle}>Shorter intervals yield more responsive data but increase CPU usage. Range: 500–5000 ms.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <input
              type="range"
              min={500}
              max={5000}
              step={100}
              value={settings.samplingIntervalMs}
              onChange={(e) => patch({ samplingIntervalMs: Number(e.target.value) })}
              style={{ flex: 1 }}
              aria-label="Sampling interval"
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', minWidth: 60, textAlign: 'right' }}>
              {settings.samplingIntervalMs} ms
            </span>
          </div>
        </Section>

        {/* ── Section: Site Allowlist ── */}
        <Section title="Site Allowlist" description="When the allowlist is empty the extension monitors all sites. Add hostnames to restrict monitoring to specific domains.">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={newSite}
              onChange={(e) => setNewSite(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSite()}
              placeholder="e.g. youtube.com"
              style={{ ...inputStyle, flex: 1 }}
              aria-label="Add site to allowlist"
            />
            <button onClick={addSite} style={primaryBtnStyle}>
              Add
            </button>
          </div>

          {settings.enabledSites.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              All sites are currently monitored.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {settings.enabledSites.map((site) => (
                <div
                  key={site}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 20,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 500 }}>{site}</span>
                  <button
                    onClick={() => removeSite(site)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#6b7280', padding: 0, lineHeight: 1 }}
                    aria-label={`Remove ${site}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Section: Advanced ── */}
        <Section title="Advanced" description="Fine-grained controls for power users.">
          <ToggleRow
            label="Enable freeze prediction"
            description="Predict whether a playback freeze is imminent based on buffer trend and drop-rate analysis."
            checked={settings.enablePrediction}
            onChange={(v) => patch({ enablePrediction: v })}
          />
          <div style={{ marginTop: 16 }}>
            <ToggleRow
              label="Show advanced metrics in popup"
              description="Display buffer behind, readyState, and playback rate in the popup's metric grid."
              checked={settings.showAdvancedMetrics}
              onChange={(v) => patch({ showAdvancedMetrics: v })}
            />
          </div>
        </Section>

        {/* ── Section: Appearance ── */}
        <Section title="Appearance" description="Select the colour theme for the extension UI.">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['light', 'dark', 'auto'] as const).map((theme) => {
              const labels = { light: '☀️ Light', dark: '🌙 Dark', auto: '🖥 System' };
              const isActive = settings.theme === theme;
              return (
                <button
                  key={theme}
                  onClick={() => patch({ theme })}
                  style={{
                    flex: 1,
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: isActive ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                    background: isActive ? '#eff6ff' : '#f9fafb',
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#1d4ed8' : '#374151',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {labels[theme]}
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Section: Danger Zone ── */}
        <Section title="Reset to Defaults" description="Restores all settings to their factory defaults. This action cannot be undone.">
          {confirmReset ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { void (async () => { await reset(); })(); setConfirmReset(false); }}
                style={{ ...primaryBtnStyle, background: '#ef4444' }}
              >
                Confirm Reset
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                style={secondaryBtnStyle}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              style={{ ...secondaryBtnStyle, borderColor: '#ef4444', color: '#ef4444' }}
            >
              Reset All Settings
            </button>
          )}
        </Section>

        {/* ── Footer ── */}
        <footer style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af' }}>
          <span>© {new Date().getFullYear()} bqtuhan · Apache 2.0</span>
          <a
            href="https://github.com/bqtuhan/video-stability-assistant"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#9ca3af', textDecoration: 'none' }}
          >
            View on GitHub
          </a>
        </footer>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Internal Layout Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, description, children }) => (
  <section style={{ marginBottom: 28 }}>
    <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#111827' }}>{title}</h2>
    {description && <p style={{ ...descStyle, marginBottom: 14 }}>{description}</p>}
    {children}
    <div style={{ marginTop: 28, height: 1, background: '#f3f4f6' }} />
  </section>
);

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
    <div style={{ flex: 1 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</p>
      {description && <p style={{ ...descStyle, marginTop: 2 }}>{description}</p>}
    </div>
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        flexShrink: 0,
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        background: checked ? '#3b82f6' : '#d1d5db',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.2s ease',
          display: 'block',
        }}
      />
    </button>
  </div>
);

const Label: React.FC<React.PropsWithChildren> = ({ children }) => (
  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827' }}>{children}</p>
);

// ---------------------------------------------------------------------------
// Style Constants
// ---------------------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  background: '#f9fafb',
  minHeight: '100vh',
  padding: '32px 16px',
};

const containerStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: '0 auto',
  background: '#ffffff',
  borderRadius: 16,
  padding: '32px 36px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.04)',
};

const descStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: '#6b7280',
  lineHeight: 1.5,
};

const selectStyle: React.CSSProperties = {
  marginTop: 8,
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  fontSize: 13,
  color: '#111827',
  background: '#fff',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  fontSize: 13,
  color: '#111827',
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#3b82f6',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s ease',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#374151',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

export default OptionsApp;
