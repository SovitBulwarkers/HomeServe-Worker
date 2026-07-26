import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Same backend the customer app talks to (NestJS API). Comes from .env
// (EXPO_PUBLIC_API_BASE_URL) — see .env.example. Falls back to the deployed
// URL only if the env var is missing.
export const LOCAL_HOST =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://nextjs-backend-with-fix.onrender.com';

export const API_BASE_URL = `${LOCAL_HOST}/api/v1`;

export const TOKEN_KEY = 'homeserve_worker_access_token';
export const REFRESH_KEY = 'homeserve_worker_refresh_token';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

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
    if (error.response?.status === 401 && !original._retry) {
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
        const { data } = await api.post('/auth/refresh');
        const newToken = data?.data?.token ?? data?.token;
        if (!newToken) throw new Error('No token in refresh response');
        await SecureStore.setItemAsync(TOKEN_KEY, newToken);
        queue.forEach((cb) => cb(newToken));
        queue = [];
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (err) {
        queue.forEach((cb) => cb(null));
        queue = [];
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_KEY);
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
