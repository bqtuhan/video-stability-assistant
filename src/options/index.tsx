/**
 * Video Stability Assistant – Options Page Entry Point
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import OptionsApp from './OptionsApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('[VSA] Options root element not found.');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>,
);
