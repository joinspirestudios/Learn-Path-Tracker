// Expo entry point for the Learn Path Tracker mobile foundation.
import React from 'react';

import { MobileApp } from './src/app/MobileApp.js';
import { MobileErrorBoundary } from './src/components/MobileErrorBoundary.js';

export default function App() {
  // Wrap the whole app so a runtime crash degrades into a safe fallback instead
  // of a blank screen. Restart re-mounts the app via a remount key.
  const [bootKey, setBootKey] = React.useState(0);
  return (
    <MobileErrorBoundary onRestart={() => setBootKey(k => k + 1)}>
      <MobileApp key={bootKey} />
    </MobileErrorBoundary>
  );
}
