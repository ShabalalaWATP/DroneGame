import { defineConfig } from 'vite';

// The browser only ever talks to one origin, so the backend needs no CORS.
const proxy = { '/api': 'http://127.0.0.1:8200' };

export default defineConfig({
  server: { host: '127.0.0.1', port: 5199, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5199, strictPort: true, proxy },
});
