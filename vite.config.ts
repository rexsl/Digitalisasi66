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
      // Preserve the ES module importmap for three@0.187.0 in dev and production builds,
      // while letting Vite bundle ./src/maquetteMath.ts cleanly into dist/assets/*.js.
      {
        name: 'standalone-html-importmap-safe',
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
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            const importmapMatch = html.match(/<script\s+type=["']importmap["'][\s\S]*?<\/script>/i);
            if (!importmapMatch) return html;
            const importmapTag = importmapMatch[0];
            const firstModuleIdx = html.search(/<script\b[^>]*type=["']module["']/i);
            const importmapIdx = html.indexOf(importmapTag);
            if (firstModuleIdx !== -1 && importmapIdx > firstModuleIdx) {
              const withoutMap = html.replace(importmapTag, '');
              return withoutMap.replace(/<head([^>]*)>/i, `<head$1>\n  ${importmapTag}`);
            }
            return html;
          },
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
