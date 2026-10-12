// Entry point: mounts the app shell. Nothing else belongs here.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('index.html is missing the #root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
