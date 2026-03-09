import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // Tailwind CSS + shadcn/ui theme
import 'gantt-lib/styles.css'; // CRITICAL: Must import for Gantt chart rendering
import './global.css'; // Gantt-specific CSS variables (must be AFTER gantt-lib to override)
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
