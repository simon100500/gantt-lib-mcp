import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; // Tailwind CSS + shadcn/ui theme
import './global.css'; // Gantt-specific CSS variables
import App from './App.tsx';
import 'gantt-lib/styles.css'; // CRITICAL: Must import for Gantt chart rendering

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
