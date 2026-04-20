/**
 * Video Stability Assistant – Popup Entry Point
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import PopupApp from './PopupApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('[VSA] Popup root element not found.');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
