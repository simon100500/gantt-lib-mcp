import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'packages/web/src'),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/runtime-core/**',
      'packages/server/dist/**',
    ],
  },
});
