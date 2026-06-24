import React    from 'react';
import ReactDOM from 'react-dom/client';
import App      from './App';
import { AuthProvider }  from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary     from './components/common/ErrorBoundary';

// NOTE: React.StrictMode intentionally runs every effect TWICE in development
// to help detect side-effects. This breaks the hydration guard in useStudyPlanner:
// the persist effect fires with empty state between the two mount cycles,
// pushing blank data to the server before fetchFullPlan() can restore it.
// Removed StrictMode to prevent this double-firing issue.
ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
);