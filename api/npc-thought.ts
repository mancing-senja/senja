import type { IncomingMessage, ServerResponse } from 'node:http';
import { generateNpcThought } from '../src/server/npc-thought.js';
import { NpcAiError } from '../src/server/npc-ai.js';

const MAX_BODY = 8 * 1024;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('allow', 'POST');
    res.end('POST only');
    return;
  }

  try {
    const body = await readJson(req);
    const thought = await generateNpcThought(body);
    sendJson(res, 200, thought);
  } catch (err) {
    const status = err instanceof NpcAiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'NPC thought AI gagal';
    if (status >= 500) console.warn('[senja] npc-thought:', err);
    sendJson(res, status, { error: message });
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of req) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > MAX_BODY) throw new NpcAiError(413, 'thought request terlalu besar');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
  } catch {
    throw new NpcAiError(400, 'JSON thought tidak valid');
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(value));
}
