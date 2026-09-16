import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 5173,
    // The browser calls /api/... on its own origin and Vite forwards it to the
    // Express server. That keeps one origin in development, so there are no
    // CORS surprises and no hard-coded localhost URL in the client code.
    proxy: {
      '/api': { target: 'http://localhost:5055', changeOrigin: true },
    },
  },
  plugins: [react()],
});
