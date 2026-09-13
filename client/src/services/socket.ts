import { io, Socket } from 'socket.io-client';

// In development, Vite proxies /socket.io to backend on port 3000.
// In production, frontend and backend can run on same host/port.
// If accessed via phone IP (e.g. 192.168.1.5:5173), socket.io connects to window.location.origin
export const socket: Socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  transports: ['websocket', 'polling']
});

export function getSocketId(): string {
  return socket.id || '';
}
