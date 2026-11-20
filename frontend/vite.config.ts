import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Dev only: when VITE_API_URL is empty, /api is proxied to the backend below
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:5000';

  return {
    define: { global: 'globalThis' },
    optimizeDeps: { include: ['buffer'] },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
      },
    },
  };
});
