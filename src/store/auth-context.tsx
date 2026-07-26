import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AuthAPI, WorkerAPI, Worker } from '../api/endpoints';
import { TOKEN_KEY, REFRESH_KEY } from '../api/client';
import { disconnectAllSockets } from '../lib/socket';

interface AuthContextValue {
  worker: Worker | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isNewWorker: boolean;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshWorker: () => Promise<void>;
  setWorker: (w: Worker) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewWorker, setIsNewWorker] = useState(false);

  const bootstrap = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) {
        const { data } = await WorkerAPI.getProfile();
        setWorker(data.data ?? (data as unknown as Worker));
      }
    } catch {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const sendOtp = async (phone: string) => {
    await AuthAPI.sendOtp(phone);
  };

  const verifyOtp = async (phone: string, otp: string) => {
    const response: any = await AuthAPI.verifyOtp(phone, otp);
    const auth = response.data.data;
    const accessToken = auth.token;

    if (accessToken) {
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    }

    setIsNewWorker(!!auth.isNew);

    // The OTP-verify response returns the bare worker row (no documents /
    // skills / services relations). Always hydrate the full profile so
    // downstream checks like hasRequiredDocuments() have real data instead
    // of silently treating an already-verified worker as having none.
    if (auth.worker) {
      setWorker(auth.worker);
    }
    try {
      const profile = await WorkerAPI.getProfile();
      setWorker(profile.data.data ?? (profile.data as unknown as Worker));
    } catch {
      // Non-fatal — the bare worker row from auth.worker is still usable
      // for the immediate navigation decision.
    }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    disconnectAllSockets();
    setWorker(null);
  };

  const refreshWorker = async () => {
    const { data } = await WorkerAPI.getProfile();
    setWorker(data.data ?? (data as unknown as Worker));
  };

  return (
    <AuthContext.Provider
      value={{
        worker,
        isLoading,
        isAuthenticated: !!worker,
        isNewWorker,
        sendOtp,
        verifyOtp,
        logout,
        refreshWorker,
        setWorker,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}