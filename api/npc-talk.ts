import type { IncomingMessage, ServerResponse } from 'node:http';
import { generateNpcTurn, NpcAiError } from '../src/server/npc-ai.js';

const MAX_BODY = 16 * 1024;
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const probe = req.method === 'GET' && req.url?.includes('__probe=1');
  if (req.method !== 'POST' && !probe) {
    res.statusCode = 405;
    res.setHeader('allow', 'POST');
    res.end('POST only');
    return;
  }

  try {
    const body = probe ? probeBody() : await readJson(req);
    const forwarded = req.headers['x-forwarded-for'];
    const clientKey = probe
      ? `preview-probe-${Date.now()}`
      : (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || 'unknown';

    // Vercel Functions deliver the deployment OIDC credential in request
    // context, not as a normal process env var. generateNpcTurn captures the
    // credential synchronously before its first await, so this tiny bridge is
    // request-safe even when the same warm function handles concurrent calls.
    const previousOidc = process.env.VERCEL_OIDC_TOKEN;
    const requestOidc = oidcFromRequest(req);
    if (!process.env.AI_GATEWAY_API_KEY && requestOidc) {
      process.env.VERCEL_OIDC_TOKEN = requestOidc;
    }
    try {
      const turn = await generateNpcTurn(body, clientKey);
      sendJson(res, 200, turn);
    } finally {
      if (previousOidc === undefined) delete process.env.VERCEL_OIDC_TOKEN;
      else process.env.VERCEL_OIDC_TOKEN = previousOidc;
    }
  } catch (err) {
    const status = err instanceof NpcAiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'NPC AI gagal';
    if (status >= 500) console.warn('[senja] npc-talk:', err);
    sendJson(res, status, { error: message });
  }
}

/** Mirrors @vercel/oidc's production lookup without adding a runtime package
 * solely for one header: request context first, env remains the local-dev
 * fallback inside generateNpcTurn. */
function oidcFromRequest(req: IncomingMessage): string | undefined {
  const direct = headerString(req.headers['x-vercel-oidc-token']);
  if (direct) return direct;

  type VercelContext = { headers?: Record<string, string | undefined> };
  type ContextGlobal = typeof globalThis & {
    [REQUEST_CONTEXT]?: { get?: () => VercelContext };
  };
  const ctx = (globalThis as ContextGlobal)[REQUEST_CONTEXT]?.get?.();
  return ctx?.headers?.['x-vercel-oidc-token'] || undefined;
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0] || undefined;
  return value || undefined;
}

function probeBody(): unknown {
  return {
    npc: {
      id: 'umar', name: 'Pak Umar', register: 'cozy', mood: 0.2,
      personality: {
        warmth: 0.75, bluntness: 0.3, humor: 0.5,
        greed: 0.2, superstition: 0.8, talkative: 0.7,
      },
      mind: { memories: [], met: 1, lastDay: 0 },
    },
    world: {
      day: 0, phase: 'senja', rain: 0.1, place: 'Dermaga', playerName: 'Dimas',
      lastCatch: { label: 'Tambakan', cm: 30 }, recordCm: 30,
      recordLabel: 'Tambakan', species: 2, coins: 30, others: 0,
    },
    history: [],
  };
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
