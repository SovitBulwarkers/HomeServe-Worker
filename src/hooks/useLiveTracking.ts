import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { WorkerAPI } from '../api/endpoints';
import { getSocket } from '../lib/socket';

/**
 * While the worker is online, periodically reads GPS position and:
 *  - updates the worker's stored location on the backend (so customers see
 *    accurate "nearby workers" results), and
 *  - if an active bookingId is provided (job is IN_PROGRESS), also streams
 *    the position over the tracking socket so the customer app can watch
 *    the worker arrive in real time.
 */
export function useLiveTracking(isOnline: boolean, activeBookingId?: string | null) {
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!isOnline) {
      watcherRef.current?.remove();
      watcherRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      watcherRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 25 },
        async (position) => {
          const { latitude, longitude } = position.coords;

          WorkerAPI.updateLocation(latitude, longitude).catch(() => undefined);

          if (activeBookingId) {
            try {
              const socket = await getSocket('tracking');
              socket.emit('worker:location', { bookingId: activeBookingId, latitude, longitude });
            } catch {
              // Non-fatal: tracking is best-effort.
            }
          }
        },
      );
    })();

    return () => {
      cancelled = true;
      watcherRef.current?.remove();
      watcherRef.current = null;
    };
  }, [isOnline, activeBookingId]);
}
