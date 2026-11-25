import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Serve and emit the self-contained single-file index.html verbatim so its
      // ES module importmap for three@0.187.0 is preserved intact in dev and build.
      {
        name: 'standalone-html-passthrough',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const urlPath = (req.url || '/').split('?')[0];
            if (urlPath === '/' || urlPath === '/index.html') {
              const htmlPath = path.resolve(__dirname, 'index.html');
              const html = fs.readFileSync(htmlPath, 'utf-8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(html);
              return;
            }
            next();
          });
        },
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const htmlSrc = path.resolve(__dirname, 'index.html');
          if (fs.existsSync(distDir) && fs.existsSync(htmlSrc)) {
            fs.copyFileSync(htmlSrc, path.resolve(distDir, 'index.html'));
          }
        },
      },
    ],
    build: {
      rollupOptions: {
        external: [/^three($|\/)/],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
