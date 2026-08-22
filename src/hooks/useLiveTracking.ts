import { useEffect } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LOCATION_TRACKING_TASK,
  ACTIVE_TRACKING_BOOKING_ID_KEY,
} from '../tasks/locationTrackingTask';

/**
 * While the worker is online, keeps GPS position updating and:
 *  - updates the worker's stored location on the backend (so customers see
 *    accurate "nearby workers" results), and
 *  - if an active bookingId is provided (job is IN_PROGRESS), also streams
 *    the position over the tracking socket so the customer app can watch
 *    the worker arrive in real time.
 *
 * Uses Location.startLocationUpdatesAsync + a TaskManager task (defined in
 * locationTrackingTask.ts) rather than watchPositionAsync, so reporting
 * keeps running via Android's foreground service / iOS "Always" location
 * while the app is backgrounded or the screen is off — a worker who goes
 * online and locks their phone (or switches apps) previously stopped
 * sharing location the moment this component's watcher was torn down,
 * which meant "nearby workers" and live job tracking could go stale almost
 * immediately.
 */
export function useLiveTracking(isOnline: boolean, activeBookingId?: string | null) {
  // Keep the task's view of the active booking in sync — the task itself
  // runs outside React and can't read component state directly.
  useEffect(() => {
    AsyncStorage.setItem(
      ACTIVE_TRACKING_BOOKING_ID_KEY,
      activeBookingId ?? '',
    ).catch(() => undefined);
  }, [activeBookingId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isOnline) {
        const started = await Location.hasStartedLocationUpdatesAsync(
          LOCATION_TRACKING_TASK,
        ).catch(() => false);
        if (started) {
          await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(
            () => undefined,
          );
        }
        return;
      }

      const { status: foregroundStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted' || cancelled) return;

      // Background permission is what actually keeps updates flowing once
      // the app leaves the foreground (Android foreground-service location,
      // iOS "Always"). If the worker declines it, we still start updates —
      // they'll just stop the moment the app backgrounds, same as before —
      // rather than blocking location sharing entirely.
      await Location.requestBackgroundPermissionsAsync().catch(() => undefined);

      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
        LOCATION_TRACKING_TASK,
      ).catch(() => false);
      if (alreadyStarted || cancelled) return;

      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15000,
        distanceInterval: 25,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'HomeServe Pro is online',
          notificationBody: 'Sharing your location so customers can find and track you.',
        },
      }).catch((e) => {
        console.warn('[useLiveTracking] failed to start background updates:', e);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isOnline]);
}
