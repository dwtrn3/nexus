/**
 * socket.js — Socket.IO client wrapper
 *
 * In local dev (VITE_SOCKET_URL set, or same-origin):  connects for real-time updates.
 * In Vercel production (serverless):                   real-time is unavailable;
 *                                                       returns a no-op stub so the
 *                                                       rest of the app doesn't change.
 */
import { io as socketIO } from 'socket.io-client';

const IS_SERVERLESS = import.meta.env.VITE_SERVERLESS === 'true';

// No-op stub used when Socket.IO isn't available
const noopSocket = {
  emit: () => {},
  on: () => {},
  off: () => {},
  disconnect: () => {},
};

export function createSocket() {
  if (IS_SERVERLESS) return noopSocket;

  const url = import.meta.env.VITE_SOCKET_URL || '/';
  return socketIO(url, { withCredentials: true });
}
