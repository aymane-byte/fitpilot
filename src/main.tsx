import './polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { t } from './i18n';
import './styles/index.css';

document.documentElement.lang = t.meta.locale.slice(0, 2);
document.documentElement.dir = t.meta.dir;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
