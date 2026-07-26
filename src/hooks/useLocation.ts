import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

interface UseLocationResult {
  loading: boolean;
  error: string | null;
  getCurrentPosition: () => Promise<{ latitude: number; longitude: number } | null>;
}

/**
 * Real device-GPS based one-shot location read. Used to get the worker's
 * position when going online, or as a fallback if live tracking hasn't
 * reported a fix yet.
 */
export function useLocation(): UseLocationResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCurrentPosition = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied. Enable it in system settings to go online.');
        return null;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch (err: any) {
      setError(err?.message ?? 'Could not detect your location. Please check GPS is enabled.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, getCurrentPosition };
}
