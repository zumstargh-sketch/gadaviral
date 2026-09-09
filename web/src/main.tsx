import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { AuthProvider } from './auth.js';
import './styles.css';

setTimeout(() => document.getElementById('splash')?.classList.add('hidden'), 900);

// The SPA is served from THREE roots: https://www.gadaviral.com/ (site
// homepage), https://www.gadaviral.com/app/ (production app) and
// https://gadaviral.com/staging/app/ (staging). Derive the router base from
// the current URL so routes, links and refresh-safe deep links work in every
// location (assets always load via the Vite base of the respective build).
const p = window.location.pathname;
const routerBase = p.startsWith('/staging/app') ? '/staging/app' : p.startsWith('/app') ? '/app' : '/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBase}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
