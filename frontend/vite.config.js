import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dedicated agent with disabled keep-alive prevents proxy reuse of stale backend sockets
const proxyAgent = new http.Agent({ keepAlive: false });

const apiProxyConfig = {
  // Use explicit IPv4 loopback (127.0.0.1) instead of 'localhost' to prevent IPv6 (::1) lookup mismatches
  target: 'http://127.0.0.1:5000',
  changeOrigin: true,
  secure: false,
  agent: proxyAgent,
  configure: (proxy) => {
    // Intercept proxy connection errors and emit structured JSON instead of Vite default 500 text/plain
    proxy.on('error', (err, req, res) => {
      if (res && !res.headersSent && !res.writableEnded) {
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({
          error: "Can't reach the sign-in service. Please try again.",
          code: err.code || 'PROXY_ERROR',
          message: err.message
        }));
      }
    });
  }
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  server: {
    port: 80,
    strictPort: true,
    proxy: {
      '/api': apiProxyConfig
    }
  },
  preview: {
    port: 80,
    strictPort: true,
    proxy: {
      '/api': apiProxyConfig
    }
  }
});
