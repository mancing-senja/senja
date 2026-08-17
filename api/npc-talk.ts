import type { IncomingMessage, ServerResponse } from 'node:http';
import { generateNpcTurn, NpcAiError } from '../src/server/npc-ai.js';

const MAX_BODY = 16 * 1024;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('allow', 'POST');
    res.end('POST only');
    return;
  }

  try {
    const body = await readJson(req);
    const forwarded = req.headers['x-forwarded-for'];
    const clientKey = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';
    const turn = await generateNpcTurn(body, clientKey);
    sendJson(res, 200, turn);
  } catch (err) {
    const status = err instanceof NpcAiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'NPC AI gagal';
    if (status >= 500) console.warn('[senja] npc-talk:', err);
    sendJson(res, status, { error: message });
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of req) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > MAX_BODY) throw new NpcAiError(413, 'request terlalu besar');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
  } catch {
    throw new NpcAiError(400, 'JSON tidak valid');
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(value));
}
