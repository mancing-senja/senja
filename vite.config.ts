import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Dev-only: lets the page hand a captured frame back to disk so the
 *  rendering can be reviewed without a compositor in the loop.
 *  POST /__shot with { name, dataUrl }. Never included in a build. */
function screenshotSink(): Plugin {
  return {
    name: 'senja-screenshot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.on('data', (c) => {
          body += c;
        });
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(body) as { name: string; dataUrl: string };
            const safe = String(name).replace(/[^a-z0-9._-]/gi, '_');
            const out = resolve(process.cwd(), '.shots', safe);
            mkdirSync(dirname(out), { recursive: true });
            writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: out }));
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [screenshotSink()],
  server: {
    port: 5173,
    strictPort: true,
    // The room server listens on its own port, but the game must reach it
    // from the same origin as the page. Otherwise anyone tunnelling the game
    // to a friend (ngrok, Cloudflare, Tailscale) would have to expose and
    // forward two ports, and the second one is a WebSocket — which most
    // quick-tunnel tools will not do for you.
    //
    // Proxying it here means one origin, one tunnel, and LAN play that works
    // without the client having to guess a port number.
    proxy: {
      '/room': {
        target: `ws://localhost:${process.env.SENJA_PORT ?? 8787}`,
        ws: true,
        rewrite: (path) => path.replace(/^\/room/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
  },
});
