import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

// The app's version number (from the main package.json), shown on screen.
const version = (JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { version: string }).version;

// Two pages: index.html (players) and host.html (the laptop's host page).
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        host: resolve(__dirname, 'host.html'),
      },
    },
  },
});
