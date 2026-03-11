import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Proxy API and WebSocket to backend
      '/api': 'http://127.0.0.1:3000',
      '/ws': {
        target: 'http://127.0.0.1:3000',
        ws: true,
      },
      // Proxy SSE endpoints to backend with proper headers
      '/stream': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        // Preserve SSE headers
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        // Disable buffering for SSE
        buffer: false,
      },
    },
  },
});
