import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Local ops portal — reuses CUTLY API on :4000. Does not touch the Expo app. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@catalogue': path.resolve(__dirname, '../constants/catalogue.ts')
    }
  },
  server: {
    port: 5174,
    open: '/',
    proxy: {
      '/api': 'http://127.0.0.1:4000'
    }
  }
});
