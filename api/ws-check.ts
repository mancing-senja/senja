import WebSocket from 'ws';

export default async function handler(_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  const host = process.env.VERCEL_URL;
  if (!host) {
    res.status(500).json({ ok: false, error: 'VERCEL_URL missing' });
    return;
  }

  const result = await new Promise<Record<string, unknown>>((resolve) => {
    const ws = new WebSocket(`wss://${host}/room`);
    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ ok: false, error: 'timeout' });
    }, 12_000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        t: 'join', room: 'vercelcheck', name: 'vercel-check', hue: 0,
        token: 'vercelchecktoken1234567890',
      }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { t?: string };
        if (msg.t === 'welcome') {
          clearTimeout(timer);
          ws.close();
          resolve({ ok: true, message: 'websocket connected and welcome received' });
        }
      } catch {
        // Ignore non-JSON diagnostics.
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });

    ws.on('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `unexpected HTTP ${response.statusCode}` });
    });
  });

  res.status(result.ok ? 200 : 502).json(result);
}
