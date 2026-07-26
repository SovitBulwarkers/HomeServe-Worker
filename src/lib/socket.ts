import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_KEY, LOCAL_HOST } from '../api/client';

const sockets: Record<string, Socket> = {};

/**
 * Returns a connected (or connecting) socket for the given namespace,
 * authenticated with the current access token. Reuses one connection
 * per namespace for the lifetime of the app.
 */
export async function getSocket(namespace: 'chat' | 'tracking'): Promise<Socket> {
  const existing = sockets[namespace];
  if (existing && existing.connected) return existing;

  const token = await SecureStore.getItemAsync(TOKEN_KEY);

  if (existing) {
    existing.auth = { token };
    existing.connect();
    return existing;
  }

  const socket = io(`${LOCAL_HOST}/${namespace}`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  sockets[namespace] = socket;
  return socket;
}

export function disconnectSocket(namespace: 'chat' | 'tracking') {
  sockets[namespace]?.disconnect();
  delete sockets[namespace];
}

export function disconnectAllSockets() {
  Object.keys(sockets).forEach((ns) => disconnectSocket(ns as 'chat' | 'tracking'));
}
