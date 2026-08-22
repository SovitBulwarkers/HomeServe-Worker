import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Same backend the customer app talks to (NestJS API). Comes from .env
// (EXPO_PUBLIC_API_BASE_URL) — see .env.example. Falls back to the deployed
// URL only if the env var is missing.
export const LOCAL_HOST =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://homeserve-api.duckdns.org';

export const API_BASE_URL = `${LOCAL_HOST}/api/v1`;

// If EXPO_PUBLIC_API_BASE_URL isn't set (no .env, or the key is missing),
// the app silently falls back to the deployed URL above — which is fine in
// production builds, but during local development this used to cause
// confusing bugs where a dev's changes never seemed to reach "their"
// backend because the app was actually talking to the deployed one the
// whole time. Surface that loudly instead of staying silent about it.
if (__DEV__ && !process.env.EXPO_PUBLIC_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[HomeServe] EXPO_PUBLIC_API_BASE_URL is not set — falling back to ' +
      `${LOCAL_HOST}. Copy .env.example to .env and set it to your local ` +
      'backend URL if that is not what you intended.',
  );
}

export const TOKEN_KEY = 'homeserve_worker_access_token';
export const REFRESH_KEY = 'homeserve_worker_refresh_token';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorizedCallback(cb: () => void) {
  onUnauthorizedCallback = cb;
}

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let queue: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    // Don't loop on auth endpoints like login or refresh itself
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push((token) => {
            if (token) {
              original.headers.Authorization = `Bearer ${token}`;
              resolve(api(original));
            } else {
              reject(error);
            }
          });
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!refreshToken) {
          // Legacy/expired session with no refresh token stored at all —
          // don't bother round-tripping to the server, just force logout.
          throw new Error('No refresh token available');
        }
        // Call refresh endpoint without sending expired Bearer token in header
        const res = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } },
        );
        const data = res.data;
        const newToken = data?.data?.token ?? data?.token ?? data?.data?.accessToken ?? data?.accessToken;
        const newRefreshToken = data?.data?.refreshToken ?? data?.refreshToken;

        if (!newToken) throw new Error('No token in refresh response');
        await SecureStore.setItemAsync(TOKEN_KEY, newToken);
        if (newRefreshToken) {
          await SecureStore.setItemAsync(REFRESH_KEY, newRefreshToken);
        }

        queue.forEach((cb) => cb(newToken));
        queue = [];
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (err) {
        queue.forEach((cb) => cb(null));
        queue = [];
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_KEY);
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback();
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
