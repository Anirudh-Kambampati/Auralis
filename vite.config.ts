import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' } },
});
