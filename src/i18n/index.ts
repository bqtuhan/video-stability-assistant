/**
 * Video Stability Assistant – i18n Advisory Utility
 *
 * Loads and provides advisory translations based on language and mode settings.
 * Follows i18n standards for internationalization support.
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import type { Language, AdvisoryMode } from '../types';
import advisoriesEn from './advisories.en.json';
import advisoriesTr from './advisories.tr.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdvisoryTranslation {
  title: string;
  description: string;
  actions: string[];
}

interface AdvisoryTranslations {
  simple: AdvisoryTranslation;
  technical: AdvisoryTranslation;
}

type AdvisoryCode =
  | 'BUFFER_CRITICAL'
  | 'STALL_RECENT'
  | 'BANDWIDTH_DEFICIT'
  | 'DROP_RATE_HIGH'
  | 'BUFFER_LOW'
  | 'BITRATE_UNSTABLE'
  | 'DECODE_SLOW'
  | 'STALL_RECURRING'
  | 'SCORE_GOOD'
  | 'LOW_READYSTATE'
  | 'HIGH_PLAYBACK_RATE'
  | 'LIVE_BUFFER_LARGE';

// ---------------------------------------------------------------------------
// Translation Registry
// ---------------------------------------------------------------------------

const translations: Record<Language, Record<AdvisoryCode, AdvisoryTranslations>> = {
  en: advisoriesEn,
  tr: advisoriesTr,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieves the advisory translation for a given code, language, and mode.
 * 
 * @param code - The advisory code identifier
 * @param language - The language to use ('en' or 'tr')
 * @param mode - The advisory mode ('simple' or 'technical')
 * @param params - Optional parameters to interpolate into the translation
 * @returns The localized advisory translation
 */
export function getAdvisoryTranslation(
  code: AdvisoryCode,
  language: Language = 'en',
  mode: AdvisoryMode = 'simple',
  params?: Record<string, string | number>,
): AdvisoryTranslation {
  const langTranslations = translations[language] || translations.en;
  const advisory = langTranslations[code];
  
  if (!advisory) {
    console.warn(`Advisory translation not found for code: ${code}`);
    return {
      title: code,
      description: 'Translation not available',
      actions: [],
    };
  }

  const translation = advisory[mode];
  
  // Interpolate parameters if provided
  if (params) {
    return {
      title: interpolate(translation.title, params),
      description: interpolate(translation.description, params),
      actions: translation.actions.map((action) => interpolate(action, params)),
    };
  }

  return translation;
}

/**
 * Interpolates parameters into a template string.
 * Replaces {paramName} with the corresponding parameter value.
 */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (key in params) {
      return String(params[key]);
    }
    return match;
  });
}

/**
 * Returns an array of all supported languages.
 */
export function getSupportedLanguages(): Language[] {
  return ['en', 'tr'];
}

/**
 * Validates if a language code is supported.
 */
export function isLanguageSupported(language: string): language is Language {
  return language === 'en' || language === 'tr';
}

/**
 * Gets the browser's preferred language or returns default.
 */
export function getBrowserLanguage(): Language {
  const browserLang = navigator.language.toLowerCase().split('-')[0];
  return isLanguageSupported(browserLang) ? browserLang : 'en';
}
