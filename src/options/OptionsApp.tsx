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
 * 8. Language & Mode    – i18n language and advisory mode settings.
 * 9. Danger Zone        – Reset to defaults.
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
  type Language,
  type AdvisoryMode,
} from '../types';

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

  // Helper for localized strings from manifest/messages.json
  const t = (key: string) => chrome.i18n.getMessage(key) || key;

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>

        {/* ── Page Header ── */}
        <header style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <img src={chrome.runtime.getURL('icons/icon48.png')} width={32} height={32} alt="" style={{ borderRadius: 6 }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
              {t('settingsTitle')}
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
            v{chrome.runtime.getManifest().version} · {t('settingsAdvanced')}
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
            {saveStatus === 'saving' ? `⏳ ${t('statusSaving')}` : saveStatus === 'saved' ? `✅ ${t('statusSaved')}` : `❌ ${t('statusError')}`}
          </div>
        )}

        {/* ── Section: Playback Mode ── */}
        <Section title={t('settingsPlaybackMode')} description="Select the scoring-weight preset that matches your viewing context.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {(['balanced', 'live', 'vod'] as PlaybackMode[]).map((mode) => {
              const labels = { balanced: `⚖️ ${t('modeBalanced')}`, live: `📡 ${t('modeLive')}`, vod: `🎬 ${t('modeVod')}` };
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

        {/* ── Section: Language & Mode ── */}
        <Section title={t('settingsLanguage')} description="Configure the language and advisory detail level.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <Label>{t('settingsLanguage')}</Label>
              <select
                value={settings.language}
                onChange={(e) => patch({ language: e.target.value as Language })}
                style={selectStyle}
              >
                <option value="en">{t('languageEn')}</option>
                <option value="tr">{t('languageTr')}</option>
              </select>
            </div>
            <div>
              <Label>{t('settingsAdvisoryMode')}</Label>
              <select
                value={settings.advisoryMode}
                onChange={(e) => patch({ advisoryMode: e.target.value as AdvisoryMode })}
                style={selectStyle}
              >
                <option value="simple">{t('advisoryModeSimple')}</option>
                <option value="technical">{t('advisoryModeTechnical')}</option>
              </select>
            </div>
          </div>
          <p style={{ ...descStyle, marginTop: 12 }}>{t('advisoryModeDescription')}</p>
        </Section>

        {/* ── Section: Notifications ── */}
        <Section title={t('settingsNotifications')} description="Configure desktop notifications for stability events.">
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
                <option value="good">Good and below</option>
                <option value="fair">Fair and below</option>
                <option value="poor">Poor and below</option>
                <option value="critical">Critical only</option>
              </select>
            </div>
          )}
        </Section>

        {/* ── Section: Site Allowlist ── */}
        <Section title={t('settingsSiteAllowlist')} description="Restrict monitoring to specific hostnames. If empty, all sites are enabled.">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="e.g. youtube.com"
              value={newSite}
              onChange={(e) => setNewSite(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSite()}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={addSite} style={primaryBtnStyle}>Add</button>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {settings.enabledSites.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Monitoring all websites.</p>
            ) : (
              settings.enabledSites.map((site) => (
                <div key={site} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  background: '#f3f4f6',
                  borderRadius: 100,
                  fontSize: 12,
                  color: '#374151',
                  border: '1px solid #e5e7eb'
                }}>
                  {site}
                  <button
                    onClick={() => removeSite(site)}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: '#9ca3af', fontSize: 14, fontWeight: 700 }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* ── Section: Advanced ── */}
        <Section title={t('settingsAdvanced')} description="Experimental features and developer metrics.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ToggleRow
              label="Enable Freeze Prediction"
              description="Uses buffer-drain algorithms to predict imminent playback freezes."
              checked={settings.enablePrediction}
              onChange={(v) => patch({ enablePrediction: v })}
            />
            <ToggleRow
              label="Show Advanced Metrics"
              description="Displays detailed technical metrics like Ready State and Decode Time in the popup."
              checked={settings.showAdvancedMetrics}
              onChange={(v) => patch({ showAdvancedMetrics: v })}
            />
            <div>
              <Label>Sampling Interval</Label>
              <p style={descStyle}>Frequency of metric collection. Lower values increase precision but use more CPU.</p>
              <select
                value={settings.samplingIntervalMs}
                onChange={(e) => patch({ samplingIntervalMs: parseInt(e.target.value) })}
                style={selectStyle}
              >
                <option value={500}>500ms (High precision)</option>
                <option value={1000}>1000ms (Default)</option>
                <option value={2000}>2000ms (Power saving)</option>
                <option value={5000}>5000ms (Minimal)</option>
              </select>
            </div>
          </div>
        </Section>

        {/* ── Section: Danger Zone ── */}
        <Section title="Danger Zone">
          {confirmReset ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { void reset(); setConfirmReset(false); }}
                style={{ ...primaryBtnStyle, background: '#ef4444' }}
              >
                {t('btnConfirmReset')}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                style={secondaryBtnStyle}
              >
                {t('btnCancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              style={{ ...secondaryBtnStyle, borderColor: '#ef4444', color: '#ef4444' }}
            >
              {t('btnReset')}
            </button>
          )}
        </Section>

        {/* ── Footer ── */}
        <footer style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af' }}>
          <span>© 2026 bqtuhan · Apache 2.0</span>
          <a
            href="https://github.com/bqtuhan/video-stability-assistant"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#9ca3af', textDecoration: 'none' }}
          >
            GitHub
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
      onClick={() => { void onChange(!checked); }}
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
