import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import * as store from './ui/store';
import './ui/theme.css';

// Dev convenience for scripted playtests: window.morpheme.{getState, dispatch, startRun, loadRun, exportCurrentRun, …}
if (import.meta.env.DEV) Object.assign(window, { morpheme: store });

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
