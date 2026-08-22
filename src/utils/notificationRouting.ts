export type NotificationData = {
  bookingId?: string;
  type?: string;
  imageUrl?: string;
  counterpartId?: string;
  senderName?: string;
  disputeId?: string;
  extraChargeRequestId?: string;
};

export type ResolvedNotificationRoute = {
  pathname: string;
  params?: Record<string, string>;
};

/** Key used to persist a notification's route while the app is backgrounded
 * or fully killed (see index.ts's Notifee background handler), so it can be
 * consumed once the app is foregrounded and the router is actually available. */
export const PENDING_NOTIFICATION_ROUTE_KEY = "pending_notification_route";

/**
 * Single source of truth for "which screen does this notification open".
 * Used by the foreground tap handler, the killed-app initial-notification
 * handler, and the backgrounded-app tap handler — previously only
 * bookingId/PREBOOKING_MESSAGE were handled here, silently dropping every
 * other notification type (disputes, payouts, in-job chat) onto the generic
 * notifications tab.
 */
export function resolveNotificationRoute(
  data: NotificationData | undefined | null,
): ResolvedNotificationRoute {
  if (!data) return { pathname: "/(tabs)/notifications" };

  // Dispute updates go straight to that dispute's thread, not the booking.
  if (data.disputeId) {
    return { pathname: "/disputes/[id]", params: { id: data.disputeId } };
  }

  // Pre-booking chat has no bookingId yet — routes to the counterpart thread.
  if (data.type === "PREBOOKING_MESSAGE" && data.counterpartId) {
    return {
      pathname: "/prebooking/[userId]",
      params: {
        userId: data.counterpartId,
        ...(data.senderName ? { userName: data.senderName } : {}),
      },
    };
  }

  // In-job chat messages open the conversation directly instead of the job
  // overview screen.
  if (data.type === "NEW_MESSAGE" && data.bookingId) {
    return { pathname: "/job/chat", params: { id: data.bookingId } };
  }

  // Payout notifications carry no bookingId — send the worker to their
  // withdrawal history instead of falling through to the generic tab.
  if (data.type === "WITHDRAWAL_COMPLETED" || data.type === "WITHDRAWAL_FAILED") {
    return { pathname: "/earnings/withdrawals" };
  }

  if (data.bookingId) {
    return { pathname: "/job/[id]", params: { id: data.bookingId } };
  }

  return { pathname: "/(tabs)/notifications" };
}
