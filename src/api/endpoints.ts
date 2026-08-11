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

export interface BankDetail {
  id?: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  upiId?: string;
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
  proofBeforePhotos?: string[];
  proofAfterPhotos?: string[];
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
    api.put("/workers/status", { isOnline }),
  getDocuments: () => api.get<{ data: WorkerDocument[] }>("/workers/documents"),
  uploadDocument: (type: string, url: string) =>
    api.post("/workers/documents", { type, url }),
  updateBankDetails: (data: BankDetail) =>
    api.put("/workers/bank-details", data),
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
  setAvailability: (date: string, isOff: boolean) =>
    api.post("/workers/availability", { date, isOff }),
  getReviews: (workerId: string, page = 1, limit = 10) =>
    api.get(`/workers/${workerId}/reviews`, { params: { page, limit } }),
};

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
  addWorkProof: (id: string, stage: "before" | "after", urls: string[]) =>
    api.post<{
      data: { proofBeforePhotos: string[]; proofAfterPhotos: string[] };
    }>(`/bookings/${id}/proof`, { stage, urls }),
};

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
  balance: number;
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
    api.post<{ data: { balance: number } }>(
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
