/** Vercel Function entrypoint for Senja's room WebSocket server.
 *
 * The shared server module exports the same Node HTTP server used locally.
 * Vercel captures that server and handles HTTP/WebSocket upgrades for /room.
 */
import server from '../src/server/index.js';

export default server;
