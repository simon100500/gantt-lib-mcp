import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false, // We'll use custom global.css
    }),
  ],
  site: 'https://getgantt.ru', // For canonical URLs and sitemap
  output: 'static', // Static build for nginx
  vite: {
    build: {
      // Optimize for production
      cssCodeSplit: true,
    },
  },
});
