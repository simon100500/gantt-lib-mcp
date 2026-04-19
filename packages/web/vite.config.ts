import { defineConfig, type Plugin } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildId = new Date().toISOString();

function appVersionPlugin(): Plugin {
  return {
    name: 'app-version-plugin',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }, null, 2),
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [appVersionPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: ['.ngrok-free.app'],
    proxy: {
      // Proxy API and WebSocket to backend
      '/api': 'http://127.0.0.1:3000',
      '/ws': {
        target: 'http://127.0.0.1:3000',
        ws: true,
      },
    },
  },
});
