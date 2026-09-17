import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTextScale } from './utils/textScale';
import './index.css';

// Apply the persisted text-size preference before the first paint so the
// sidebar never flashes at the wrong scale.
initTextScale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
