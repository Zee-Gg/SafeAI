/*
  Starts the Detection Playground (DEV ONLY): loads fonts and styles, mounts the React app.
*/
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '../../src/styles/ui.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Playground is missing its #root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
