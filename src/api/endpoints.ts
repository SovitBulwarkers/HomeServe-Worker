import api from "./client";

// ---------- Shared types ----------
export interface WorkerSkill {
  id: string;
  skill: string;
}

export interface WorkerDocument {
  id: string;
  type: string;
  url: string;
  isVerified: boolean;
}

export type BankVerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "FAILED";

export interface BankDetail {
  id?: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  upiId?: string;
  verificationStatus?: BankVerificationStatus;
  verifiedAt?: string | null;
  verificationFailReason?: string | null;
}

export interface WorkerServiceLink {
  id: string;
  serviceId: string;
  price?: number;
  service?: Service;
}

export interface Worker {
  id: string;
  phone: string;
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
  bio?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  isActive: boolean;
  isOnline: boolean;
  isBlocked: boolean;
  pausedNewRequests?: boolean;
  rating: number;
  totalReviews: number;
  totalJobs: number;
  serviceRadius: number;
  latitude?: number | null;
  longitude?: number | null;
  experience: number;
  skills?: WorkerSkill[];
  documents?: WorkerDocument[];
  bankDetail?: BankDetail | null;
  services?: WorkerServiceLink[];
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  image?: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  price?: number;
  basePrice?: number;
  image?: string;
  categoryId: string;
  // Real, admin-configured duration range and price-breakdown checklist —
  // same fields the customer app shows on the service detail screen.
  // Empty/undefined unless an admin has actually filled them in.
  duration?: number;
  durationMaxMinutes?: number | null;
  includedItems?: string[];
  excludedItems?: string[];
}

// Customer fields are optional/nullable because the backend redacts phone
// and email once a job is COMPLETED / CANCELLED / REJECTED — the worker
// no longer needs (or gets) that contact info after the job is over.
export interface JobCustomer {
  id?: string;
  name?: string | null;
  avatar?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface JobAddress {
  id: string;
  label: string;
  fullAddress: string;
  landmark?: string | null;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
}

export type JobStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface JobItem {
  id: string;
  quantity: number;
  price: number;
  service: Service;
}

export interface Job {
  id: string;
  bookingNumber: string;
  status: JobStatus;
  scheduledDate: string;
  scheduledTime: string;
  // When the worker actually started the job (see BookingsService.startJob).
  // Used client-side to gate the "Request more time" button — the backend
  // rejects extra-time requests made too soon after start (AppSetting
  // extra_time_min_minutes_after_start), so the button should reflect
  // that instead of letting the worker tap it and hit an error.
  startedAt?: string | null;
  description?: string | null;
  images?: string[];
  totalAmount: number;
  discountAmount: number;
  taxAmount: number;
  finalAmount: number;
  total?: number;
  notes?: string | null;
  cancelReason?: string | null;
  completedAt?: string | null;
  createdAt: string;
  user?: JobCustomer;
  address?: JobAddress;
  items?: JobItem[];
  payment?: { status: string; method: string; amount: number } | null;
  // Present on "pending requests" (new job) results only — km from the
  // worker's last known location to this booking's address.
  distanceKm?: number | null;
  // Set once the overdue-detection cron flags this job — worker app shows
  // a warning banner when this is present.
  overdueFlaggedAt?: string | null;
  runningLateMinutes?: number | null;
  runningLateReason?: string | null;
  // How many times this booking has already been rescheduled — capped at
  // MAX_RESCHEDULE_COUNT (3) on the backend, past which reschedule
  // attempts are rejected and cancel+rebook is the only path.
  rescheduleCount?: number;
  // Set once this worker has proposed a new time and cleared once the
  // customer responds (accept applies it to scheduledDate/scheduledTime
  // and clears these; decline just clears these) — see
  // BookingsService.rescheduleBooking / respondToReschedule.
  pendingRescheduleDate?: string | null;
  pendingRescheduleTime?: string | null;
  // Set only on a direct request — the customer picked this worker's
  // profile specifically rather than letting the job broadcast to the
  // open pool. Shown as a "Customer requested you" badge.
  preferredWorkerId?: string | null;
  // >0 means this job was auto-reassigned after a previous worker
  // accepted and never showed up — worth knowing before you head out,
  // since the customer may already be frustrated by the wait.
  reassignCount?: number;
  issueType?: string | null;
  issueDetail?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  proofBeforePhotos?: string[];
  proofAfterPhotos?: string[];
  extraCharges?: {
    id: string;
    label: string;
    amount: number;
    reason?: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
  }[];
  extraTimeRequests?: {
    id: string;
    requestedMinutes: number;
    graceMinutesApplied: number;
    chargeableMinutes: number;
    amount: number;
    reason?: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    paymentStatus: "NOT_REQUIRED" | "PENDING" | "PAID";
    createdAt: string;
  }[];
}

// Helper function to check if a booking requires Cash Collection on Delivery (COD) vs Paid Online
export function checkIsCodPayment(job: any): boolean {
  if (!job) return false;

  // 1. Explicit boolean paid flags from API
  if (job.isPaid === true || job.paid === true) return false;
  if (job.isPaid === false || job.paid === false) {
    const m = (job.payment?.method || job.paymentMethod || job.payment_method || '').toString().toUpperCase();
    if (m === 'COD' || m === 'CASH' || !m) return true;
  }

  // 2. Extract payment status string from API
  const status = (
    job.payment?.status ||
    job.paymentStatus ||
    job.payment_status ||
    ''
  ).toString().toUpperCase();

  // If API status is PAID / COMPLETED / SUCCESS / CAPTURED -> Paid Online
  if (['COMPLETED', 'PAID', 'SUCCESS', 'CAPTURED', 'SETTLED'].includes(status)) {
    return false;
  }

  // 3. Extract payment method string from API
  const method = (
    job.payment?.method ||
    job.paymentMethod ||
    job.payment_method ||
    job.method ||
    ''
  ).toString().toUpperCase();

  // Explicit Online payment methods -> Paid Online
  if (['UPI', 'CARD', 'ONLINE', 'NETBANKING', 'RAZORPAY', 'STRIPE', 'PAYTM', 'WALLET'].includes(method)) {
    return false;
  }

  // Explicit Cash on Delivery methods -> Collect Cash
  if (['COD', 'CASH', 'PAY_ON_DELIVERY'].includes(method)) {
    return true;
  }

  // If payment status is explicitly PENDING or UNPAID and not an online method -> Collect Cash
  if (['PENDING', 'UNPAID', 'DUE'].includes(status)) {
    return true;
  }

  // 4. Default: If no explicit COD/Unpaid flag is sent by backend API, treat as Paid Online
  return false;
}

// ---------- Auth ----------
export const AuthAPI = {
  sendOtp: (phone: string) =>
    api.post("/auth/send-otp", { phone, role: "WORKER" }),
  verifyOtp: (phone: string, otp: string) =>
    api.post("/auth/verify-otp", { phone, otp, role: "WORKER" }),
  me: () => api.get("/auth/me"),
};

// ---------- Worker profile ----------
export const WorkerAPI = {
  getProfile: () => api.get<{ data: Worker }>("/workers/profile"),
  updateProfile: (
    data: Partial<
      Pick<
        Worker,
        "name" | "email" | "avatar" | "bio" | "experience" | "serviceRadius"
      >
    >,
  ) => api.put("/workers/profile", data),
  updateFcmToken: (fcmToken: string) =>
    api.put("/users/fcm-token", { fcmToken }),
  updateLocation: (latitude: number, longitude: number) =>
    api.put("/workers/location", { latitude, longitude }),
  setOnlineStatus: (isOnline: boolean) =>
    api.put("/workers/status", { isOnline: Boolean(isOnline) }),
  // Pause/resume NEW job matching without going offline — existing jobs
  // and live tracking are unaffected.
  setPausedStatus: (paused: boolean) =>
    api.put("/workers/pause", { paused: Boolean(paused) }),
  getDocuments: () => api.get<{ data: WorkerDocument[] }>("/workers/documents"),
  uploadDocument: (type: string, url: string) =>
    api.post("/workers/documents", { type, url }),
  updateBankDetails: (data: BankDetail) =>
    api.put("/workers/bank-details", data),
  // Kick off verification of the on-file bank account. Resolves to
  // PENDING (awaiting manual/admin review) or FAILED (bad IFSC/account
  // format) — never immediately VERIFIED.
  requestBankVerification: () =>
    api.post<{ message: string; data: BankDetail }>(
      "/workers/bank-details/verify",
    ),
  updateSkills: (skills: string[]) => api.put("/workers/skills", { skills }),
  updateServices: (serviceIds: string[]) =>
    api.put("/workers/services", { serviceIds }),
  getWorkingHours: () => api.get("/workers/working-hours"),
  setWorkingHours: (
    hours: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isOff: boolean;
    }[],
  ) => api.put("/workers/working-hours", { hours }),
  setAvailability: (date: string, isOff: boolean = true) => {
    const d = new Date(date);
    const formattedDate = !isNaN(d.getTime()) ? d.toISOString() : date;
    return api.post("/workers/availability", { date: formattedDate, isOff: Boolean(isOff) });
  },
  getAvailability: (from?: string, to?: string) =>
    api.get<{ data: { date: string; isOff: boolean }[] }>("/workers/availability", {
      params: { from, to },
    }),
  clearAvailability: (date: string) => {
    const d = new Date(date);
    const dateParam = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : date;
    return api.delete(`/workers/availability/${encodeURIComponent(dateParam)}`);
  },
  getReviews: (workerId: string, page = 1, limit = 10) =>
    api.get<{ data: { reviews: WorkerReview[]; total: number; page: number; limit: number } }>(
      `/workers/${workerId}/reviews`,
      { params: { page, limit } },
    ),
  // Worker's side of a completed job: rate the customer (punctuality, site
  // access, clarity). Internal signal only — never shown on the
  // customer's public profile.
  rateCustomer: (bookingId: string, rating: number, comment?: string) =>
    api.post('/reviews/customer', { bookingId, rating, comment }),
};

export interface WorkerReview {
  id: string;
  bookingId: string;
  rating: number;
  comment?: string | null;
  images?: string[];
  createdAt: string;
  user?: { name?: string | null; avatar?: string | null };
}

// ---------- Categories & Services (for choosing which services a worker offers) ----------
export const CatalogAPI = {
  getCategories: () => api.get<{ data: Category[] }>("/categories"),
  getServices: (params?: { categoryId?: string; search?: string }) =>
    api.get<{ data: Service[] }>("/services", { params }),
};

// ---------- Jobs (bookings, from the worker's point of view) ----------
export const JobsAPI = {
  pendingRequests: () =>
    api.get<{ data: Job[]; meta?: { reason?: string } }>(
      "/bookings/worker/pending-requests",
    ),
  today: () => api.get<{ data: Job[] }>("/bookings/worker/today"),
  upcoming: () => api.get<{ data: Job[] }>("/bookings/worker/upcoming"),
  myJobs: (status?: JobStatus) =>
    api.get<{ data: Job[] }>("/bookings/worker/my", {
      params: status ? { status } : undefined,
    }),
  getById: (id: string) => api.get<{ data: Job }>(`/bookings/${id}`),
  accept: (id: string) => api.put(`/bookings/${id}/accept`),
  reject: (id: string) => api.put(`/bookings/${id}/reject`),
  start: (id: string, otp: string) => api.put(`/bookings/${id}/start`, { otp }),
  complete: (id: string) => api.put(`/bookings/${id}/complete`),
  cancel: (id: string, reason: string) =>
    api.put(`/bookings/${id}/cancel`, { reason }),
  reschedule: (id: string, scheduledDate: string, scheduledTime: string) =>
    api.put(`/bookings/${id}/reschedule`, { scheduledDate, scheduledTime }),
  // Emergency alert during an active job — notifies support/admin
  // immediately with the worker's current location.
  raiseSos: (id: string, data: { latitude?: number; longitude?: number; message?: string }) =>
    api.post(`/bookings/${id}/sos`, data),
  addWorkProof: (id: string, stage: "before" | "after", urls: string[]) =>
    api.post<{
      data: { proofBeforePhotos: string[]; proofAfterPhotos: string[] };
    }>(`/bookings/${id}/proof`, { stage, urls }),
  // Proactively tell the customer you'll be late, before the system's own
  // overdue detection would catch it.
  reportRunningLate: (id: string, minutes: number, reason: string) =>
    api.post(`/bookings/${id}/running-late`, { minutes, reason }),
  // Work outside the fixed-price package (gas refill, spare parts, extra
  // labour, etc.) — creates a PENDING request the customer approves or
  // rejects in their app. Nothing is added to the total until they do.
  requestExtraCharge: (
    id: string,
    data: { label: string; amount: number; reason?: string },
  ) => api.post(`/bookings/${id}/extra-charge`, data),
  // Ask the customer to approve extending an in-progress job past its
  // scheduled duration. A small free "grace" allowance is applied
  // automatically on the backend before anything is charged — see
  // Job['extraTimeRequests'].
  requestExtraTime: (
    id: string,
    data: { extraMinutes: number; reason?: string },
  ) => api.post(`/bookings/${id}/extra-time`, data),
  // This worker's own real history with a specific customer — past
  // bookings, ratings *they* gave, any complaint on record. Used to show a
  // heads-up on an incoming job request, mirroring the warning the
  // customer app shows before rebooking a worker who did a bad job.
  getHistoryWithCustomer: (userId: string) =>
    api.get<{ data: CustomerHistory }>(`/bookings/worker/history/customer/${userId}`),
  // Chronological event timeline for a booking — created, worker
  // declines, accepted, rescheduled, running-late reports, no-show
  // reassignment, started, completed/cancelled/rejected — already sorted
  // oldest-first by the backend.
  getTimeline: (id: string) =>
    api.get<{ data: BookingTimeline }>(`/bookings/${id}/timeline`),
};

export type TimelineEventType =
  | 'CREATED'
  | 'WORKER_DECLINED'
  | 'ACCEPTED'
  | 'RESCHEDULED'
  | 'RUNNING_LATE'
  | 'REASSIGNED_NO_SHOW'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export interface TimelineEvent {
  type: TimelineEventType;
  label: string;
  at: string;
}

export interface BookingTimeline {
  bookingId: string;
  bookingNumber: string;
  events: TimelineEvent[];
};

export interface CustomerHistory {
  workerId: string;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  averageRatingGiven: number | null;
  hasComplaint: boolean;
  complaints: { bookingId: string; rating: number; comment: string; createdAt: string }[];
  bookings: {
    id: string;
    bookingNumber: string;
    status: string;
    scheduledDate: string;
    serviceNames: string[];
    finalAmount: number;
    rating: number | null;
    comment: string | null;
  }[];
}

// ---------- Chat ----------
export interface ChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  senderType: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface BookingChatSummary {
  id: string;
  status: JobStatus;
  user?: JobCustomer;
  chatMessages?: ChatMessage[];
}

export const ChatAPI = {
  getBookingChats: () =>
    api.get<{ data: BookingChatSummary[] }>("/chat/bookings"),
  getMessages: (bookingId: string, page = 1, limit = 50) =>
    api.get<{ data: ChatMessage[] }>(`/chat/${bookingId}/messages`, {
      params: { page, limit },
    }),
  sendMessage: (bookingId: string, message: string) =>
    api.post<{ data: ChatMessage }>(`/chat/${bookingId}/messages`, { message }),
  getUnreadCount: (bookingId: string) => api.get(`/chat/${bookingId}/unread`),
};

export interface PreBookingThread {
  counterpartId: string;
  counterpartName: string;
  counterpartAvatar?: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageFromMe: boolean;
  unreadCount: number;
}

export const PreBookingChatAPI = {
  // :otherPartyId is the customer's userId, from the worker's side.
  getThreads: () => api.get<{ data: PreBookingThread[] }>("/chat/prebooking/threads"),
  getMessages: (userId: string, page = 1, limit = 50) =>
    api.get<{ data: ChatMessage[] }>(`/chat/prebooking/${userId}/messages`, {
      params: { page, limit },
    }),
  sendMessage: (userId: string, message: string) =>
    api.post<{ data: ChatMessage }>(`/chat/prebooking/${userId}/messages`, { message }),
  getUnreadCount: (userId: string) =>
    api.get<{ data: { count: number } }>(`/chat/prebooking/${userId}/unread`),
  markRead: (userId: string) => api.post(`/chat/prebooking/${userId}/read`),
};

// ---------- Wallet & Earnings ----------
export interface Transaction {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  description: string;
  referenceId?: string | null;
  createdAt: string;
}

export interface WorkerWallet {
  id: string;
  // Withdrawable earnings only — never goes negative. Cash-job commission
  // owed to the platform lives separately in `commissionDebt` below, and
  // money still in the post-job settlement hold lives in `pendingBalance`
  // — neither is folded into `balance` (see WorkerWallet in schema.prisma).
  balance: number;
  // Commission owed to the platform from cash-collected jobs (including
  // cash-collected extra charges). Always >= 0; cleared via SettleDebtModal
  // or auto-netted against the worker's next digital-payment earnings.
  commissionDebt: number;
  // Earnings credited from a completed job but still inside the
  // settlement hold — not yet withdrawable. Moves into `balance`
  // automatically once each Earning's hold period passes.
  pendingBalance: number;
  transactions?: Transaction[];
}

export interface Earning {
  id: string;
  bookingId?: string | null;
  amount: number;
  commission: number;
  netAmount: number;
  date: string;
}

export type WithdrawalStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface Withdrawal {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  bankName: string;
  accountLast4: string;
  ifscCode: string;
  payoutRef?: string | null;
  // RazorpayX Payouts API linkage — set once the backend actually calls
  // the gateway. payoutStatus mirrors RazorpayX's own vocabulary
  // (queued/processing/processed/reversed/rejected/failed), separate
  // from our own coarser `status` above.
  razorpayxPayoutId?: string | null;
  payoutStatus?: string | null;
  failureReason?: string | null;
  requestedAt: string;
  completedAt?: string | null;
}

export interface MonthlyStatement {
  period: { month: number; year: number };
  jobsCompleted: number;
  grossEarnings: number;
  commissionCharged: number;
  netEarnings: number;
  totalPaidOut: number;
  totalDebtSettled: number;
  withdrawals: Withdrawal[];
  currentBalance: number;
  currentCommissionDebt: number;
}

export const WalletAPI = {
  getWallet: () => api.get<{ data: WorkerWallet }>("/wallet/worker"),
  getTransactions: (page = 1, limit = 20) =>
    api.get("/wallet/worker/transactions", { params: { page, limit } }),
  getEarnings: (period: "today" | "week" | "month" = "today") =>
    api.get<{
      data: {
        period: string;
        totalAmount: number;
        totalCommission: number;
        netEarnings: number;
        totalJobs: number;
        earnings: Earning[];
      };
    }>("/wallet/worker/earnings", { params: { period } }),
  withdraw: (amount: number) => api.post("/wallet/worker/withdraw", { amount }),
  getMonthlyStatement: (month: number, year: number) =>
    api.get<{ data: MonthlyStatement }>("/wallet/worker/monthly-statement", {
      params: { month, year },
    }),
  getWithdrawals: (page = 1, limit = 20) =>
    api.get<{ data: { withdrawals: Withdrawal[]; total: number; page: number; limit: number } }>(
      "/wallet/worker/withdrawals",
      { params: { page, limit } },
    ),
  createSettleDebtOrder: () =>
    api.post<{
      data: {
        orderId: string;
        amount: number;
        currency: string;
        keyId: string;
        owed: number;
      };
    }>("/wallet/worker/settle-debt/order"),
  verifySettleDebt: (dto: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    amount: number;
  }) =>
    // Backend returns the remaining commissionDebt after this payment is
    // applied (see WalletService.verifyDebtSettlement) — not a wallet
    // `balance`, since settling debt never touches the withdrawable
    // balance at all.
    api.post<{ data: { commissionDebt: number } }>(
      "/wallet/worker/settle-debt/verify",
      dto,
    ),
};

// ---------- Notifications ----------
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export const NotificationAPI = {
  getAll: (page = 1, limit = 20) =>
    api.get<{
      data: {
        notifications: AppNotification[];
        total: number;
        unreadCount: number;
      };
    }>("/notifications", { params: { page, limit } }),
  markRead: (id: string) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put("/notifications/read-all"),
};

// ---------- Support ----------
export const SupportAPI = {
  getFaq: () => api.get("/support/faq"),
  createTicket: (data: { subject: string; description: string }) =>
    api.post("/support/tickets", data),
  myTickets: () => api.get("/support/tickets"),
  getTicket: (id: string) => api.get(`/support/tickets/${id}`),
  reply: (id: string, message: string) =>
    api.post(`/support/tickets/${id}/reply`, { message }),
  closeTicket: (id: string) => api.put(`/support/tickets/${id}/close`),
};

// ---------- Disputes ----------
export type DisputeReason =
  | "SERVICE_NOT_AS_DESCRIBED"
  | "WORKER_NO_SHOW"
  | "OVERCHARGED"
  | "DUPLICATE_CHARGE"
  | "UNAUTHORIZED_CHARGE"
  | "DAMAGE_OR_LOSS"
  | "EXTRA_CHARGE_UNJUSTIFIED"
  | "REFUND_NOT_RECEIVED"
  | "OTHER";

export type DisputeStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "RESOLVED_REFUNDED"
  | "RESOLVED_PARTIAL_REFUND"
  | "RESOLVED_UPHELD"
  | "RESOLVED_NO_ACTION"
  | "WITHDRAWN";

export interface Dispute {
  id: string;
  bookingId: string;
  paymentId: string;
  bookingUserId: string;
  raisedByWorkerId?: string | null;
  raisedByRole: "CUSTOMER" | "WORKER" | "ADMIN";
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  amountClaimed?: number | null;
  evidenceUrls?: string[] | null;
  resolutionRefundId?: string | null;
  resolutionNote?: string | null;
  resolvedByAdminId?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  booking?: { bookingNumber: string };
}

export const DisputesAPI = {
  raise: (data: {
    bookingId: string;
    reason: DisputeReason;
    description: string;
    amountClaimed?: number;
    evidenceUrls?: string[];
  }) => api.post<{ message: string; data: Dispute }>("/disputes/worker", data),
  myDisputes: (page = 1, limit = 20) =>
    api.get<{ data: { disputes: Dispute[]; total: number; page: number; limit: number } }>(
      "/disputes/worker/mine",
      { params: { page, limit } },
    ),
  getById: (id: string) => api.get<{ data: Dispute }>(`/disputes/${id}`),
  withdraw: (id: string) => api.post<{ message: string; data: Dispute }>(`/disputes/${id}/withdraw`),
};

// ---------- Upload ----------
export const UploadAPI = {
  uploadImage: (formData: FormData, folder = "workers") =>
    api.post<{ data: { url: string } }>("/upload/single", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      params: { folder },
    }),
};

// ---------- Tracking ----------
export interface TrackingLocation {
  workerId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface EtaResult {
  available: boolean;
  reason?: string;
  approximate?: boolean;
  distanceKm?: number;
  etaMinutes?: number;
  lastLocationAt?: string;
}

export const TrackingAPI = {
  // Server-computed straight-line ETA, only meaningful once this worker is
  // ACCEPTED and en route — the backend returns available:false with a
  // reason otherwise (no coordinates on file, no location reported yet).
  getEta: (bookingId: string) =>
    api.get<{ data: EtaResult }>(`/tracking/booking/${bookingId}/eta`),
};
