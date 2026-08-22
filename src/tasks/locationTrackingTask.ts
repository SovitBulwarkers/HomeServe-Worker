import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WorkerAPI } from "../api/endpoints";
import { getSocket } from "../lib/socket";

export const LOCATION_TRACKING_TASK = "homeserve-worker-location-tracking";

/** The booking currently being tracked (if any), so this task — which runs
 * outside of any React component/hook — knows whether to also stream a fix
 * over the tracking socket. Kept in sync by useLiveTracking. */
export const ACTIVE_TRACKING_BOOKING_ID_KEY = "active_tracking_booking_id";

// expo-location requires this task to be defined exactly once, at module
// scope, before Location.startLocationUpdatesAsync is ever called — the
// same constraint that applies to Notifee's background handler in index.ts.
// Defining it here (rather than inside useLiveTracking) means it keeps
// running and reporting position even while the worker app is fully
// backgrounded or the screen that "owns" tracking has unmounted.
TaskManager.defineTask(
  LOCATION_TRACKING_TASK,
  async ({ data, error }: { data: any; error: any }) => {
    if (error) {
      console.warn("[locationTrackingTask]", error.message);
      return;
    }

    const locations = data?.locations as
      | Array<{ coords: { latitude: number; longitude: number } }>
      | undefined;
    const latest = locations?.[locations.length - 1];
    if (!latest) return;

    const { latitude, longitude } = latest.coords;

    try {
      await WorkerAPI.updateLocation(latitude, longitude);
    } catch {
      // Non-fatal: this is best-effort and will simply retry on the next tick.
    }

    try {
      const activeBookingId = await AsyncStorage.getItem(
        ACTIVE_TRACKING_BOOKING_ID_KEY,
      );
      if (activeBookingId) {
        const socket = await getSocket("tracking");
        socket.emit("worker:location", {
          bookingId: activeBookingId,
          latitude,
          longitude,
        });
      }
    } catch {
      // Non-fatal: the customer's live map will just catch up on the next fix.
    }
  },
);
