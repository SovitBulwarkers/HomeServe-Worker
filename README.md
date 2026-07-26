# HomeServe Pro — Worker App

Expo SDK 54 (React Native 0.81, React 19, expo-router 6) app for HomeServe service
providers ("workers"). Talks to the same NestJS backend as the customer app.

## Setup

```bash
npm install
npx expo start
```

Push notifications and background location require a **development build**
(they don't work in Expo Go on SDK 54):

```bash
npx expo run:android   # or: npx expo run:ios
```

## Backend URL

Edit `src/api/client.ts` → `LOCAL_HOST`. Defaults to the same deployed backend
the customer app uses. For local development against `npm run start:dev` in
the backend repo, point it at your machine's address instead (see comments in
that file).

## What's implemented (all real network calls, no mock/dummy data)

- **Onboarding**: shown once ever, first launch only (persisted via
  AsyncStorage) — not shown again after that, even after logout.
- **Auth**: real OTP login against `/auth/send-otp` + `/auth/verify-otp`
  (`role: WORKER`), token stored in SecureStore with silent refresh.
- **Registration**: name/photo/bio/experience, skill tags, and service
  selection pulled live from `/categories` + `/services`, submitted to the
  worker profile/skills/services endpoints.
- **Approval gating**: new workers land on a "pending approval" screen and
  can't reach the job flow until an admin approves them (`worker.status`).
- **Home dashboard**: online/offline toggle (drives real GPS location
  updates), today's jobs, today's earnings, active job banner.
- **Jobs**: new requests (accept/decline), upcoming, and history tabs, all
  from `/bookings/worker/*`. Accepting/declining/starting/completing a job
  calls the real booking-status endpoints.
- **Job detail**: shows customer + address while the job is active; once a
  job is COMPLETED/CANCELLED/REJECTED, contact info is hidden in the UI —
  the backend itself also strips phone/email/exact address at that point
  (see "Privacy" below), so this isn't just a client-side toggle.
- **Chat**: real-time via the existing `/chat` Socket.IO namespace
  (`join-booking` / `send-message` / `new-message`), backed by
  `/chat/:bookingId/messages` REST for history.
- **Live tracking**: while online (and especially mid-job), streams GPS
  position to `/workers/location` and the `/tracking` socket namespace so
  the customer app's live map stays accurate.
- **Earnings/wallet**: real balance, today/week/month earnings breakdown,
  transaction history, and withdrawal requests against `/wallet/worker/*`.
- **Notifications**: push registration (`/workers/fcm-token`) + in-app list
  from `/notifications`, tapping one deep-links to the relevant job.
- **Profile**: edit profile/photo, skills & services, document upload for
  KYC verification, bank details for payouts, working hours.
- **Support**: FAQ + support tickets (create/list), matching the backend's
  `/support/*` routes.

## Privacy: customer data after job completion

The **client** hides the customer's phone/email and exact address once a
job's status is `COMPLETED`, `CANCELLED`, or `REJECTED`.

This is enforced end-to-end, not just hidden in the UI — it requires two
small additions on the **backend** (not shipped in this app's zip, since a
mobile app can't itself stop the API from returning data):

1. In `bookings.service.ts`, strip `user.phone` / `user.email` and reduce
   `address` to city-only once `booking.status` is one of
   `COMPLETED | CANCELLED | REJECTED`, for every worker-facing booking query
   (`findWorkerBookings`, `findOne` when the requester is a worker,
   `getTodayJobs`, `getUpcomingJobs`).
2. Add `PUT /workers/fcm-token` (mirrors the pattern of the existing
   `PUT /workers/status` endpoint) so this app can register for push.

Happy to package those two backend changes separately if useful — just ask.
