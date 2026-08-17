/** Vercel Function entrypoint for the existing Senja room server.
 *
 * Vercel's Node runtime captures the HTTP server started by index.ts. The
 * public /room path is rewritten here by vercel.json so the browser can keep
 * using the same same-origin WebSocket URL in development and production.
 */
import '../src/server/index.js';
