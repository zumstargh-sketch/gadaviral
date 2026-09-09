import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { AuthProvider } from './auth.js';
import './styles.css';

setTimeout(() => document.getElementById('splash')?.classList.add('hidden'), 900);

// The SPA is served from TWO roots in production: https://www.gadaviral.com/
// (site homepage) and https://www.gadaviral.com/app/. Derive the router base
// from the current URL so routes, links and refresh-safe deep links work in
// both places (assets always load from /app/ via the Vite base config).
const routerBase = window.location.pathname.startsWith('/app') ? '/app' : '/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBase}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
