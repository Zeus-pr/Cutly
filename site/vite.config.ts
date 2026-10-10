import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** www.cutly.buzz / Cloudflare Pages — site at domain root. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  server: {
    port: 5173,
    open: '/',
    proxy: {
      '/api': 'http://127.0.0.1:4000'
    }
  }
});
