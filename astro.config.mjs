import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cake.graye.co.uk',
  vite: {
    server: {
      // `npm run dev:api` serves the checkout Lambda locally on this port.
      proxy: { '/api': 'http://localhost:8787' },
    },
  },
});
