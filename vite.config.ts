import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['test/**/*.test.ts'] },
} as any);
