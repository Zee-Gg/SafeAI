/*
  Starts the popup: loads the fonts and styles, then mounts the React app into #root.
  Geist is bundled locally from npm (no CDN), so the popup works offline and leaks nothing.
*/
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '../../src/styles/ui.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Popup is missing its #root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
