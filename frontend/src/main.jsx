// Global stylesheets FIRST, in an explicit order. Previously App was imported
// before these, so the cascade depended on which components App happened to
// import first (and changed whenever a view was lazy-loaded). This order is
// the one the app has effectively always rendered with; popups.css is last on
// purpose so the shared popup rules win.
import './components/Login.css';
import './components/ui/ui.css';
import './components/FioriOpCard.css';
import './components/layout/layout.css';
import './components/HomePage.css';
import './tokens.css';
import './tailwind.css';
import './index.css';
import './sap-theme.css';
import './components/ui/popups.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
