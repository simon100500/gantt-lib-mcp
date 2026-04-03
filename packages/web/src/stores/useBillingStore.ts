/**
 * Billing store — subscription status, payments, and payment flow
 *
 * Uses fetchWithAuthRetry pattern from useAuthStore for authenticated requests.
 */

import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';

export type UsageState = 'tracked' | 'not_applicable';
export type RemainingState = 'tracked' | 'unlimited' | 'not_applicable';

export interface TrackedUsageEntry {
  usageState: 'tracked';
  limit: number | 'unlimited';
  used: number;
  period: 'daily' | 'lifetime' | 'current';
  periodBucket: string;
}

export interface NotApplicableUsageEntry {
  usageState: 'not_applicable';
  limit: boolean | string;
  used: null;
  period: null;
  periodBucket: null;
}

export type UsageEntry = TrackedUsageEntry | NotApplicableUsageEntry;

export interface TrackedRemainingEntry {
  remainingState: 'tracked';
  limit: number;
  remaining: number;
}

export interface UnlimitedRemainingEntry {
  remainingState: 'unlimited';
  limit: 'unlimited';
  remaining: 'unlimited';
}

export interface NotApplicableRemainingEntry {
  remainingState: 'not_applicable';
  limit: boolean | string;
  remaining: null;
}

export type RemainingEntry =
  | TrackedRemainingEntry
  | UnlimitedRemainingEntry
  | NotApplicableRemainingEntry;

export interface SubscriptionStatus {
  plan: string;
  periodEnd: string | null;
  aiUsed: number;
  aiLimit: number;
  isActive: boolean;
  planMeta: {
    id: string;
    label: string;
    pricing: {
      monthly: number;
      yearly: number;
    };
  };
  limits: Record<string, unknown>;
  usage: Record<string, UsageEntry>;
  remaining: Record<string, RemainingEntry>;
  legacyLimits?: {
    projects: number;
    aiGenerations: number;
    aiRefinements: number;
    resources: number;
    teamMembers: number;
    archive: boolean;
    resource_pool: boolean;
    export: string;
  };
}

export interface UsageStatus {
  plan: string;
  planMeta: SubscriptionStatus['planMeta'];
  limits: SubscriptionStatus['limits'];
  usage: SubscriptionStatus['usage'];
  remaining: SubscriptionStatus['remaining'];
}

export interface PaymentRecord {
  id: string;
  plan: string;
  period: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface BillingState {
  subscription: SubscriptionStatus | null;
  usage: UsageStatus | null;
  payments: PaymentRecord[];
  loading: boolean;
  error: string | null;
  // Payment flow state
  paymentLoading: boolean;
  paymentStatusChecking: boolean;
  paymentSuccess: string | null;
  paymentError: string | null;
  activePaymentId: string | null;
}

export interface BillingActions {
  fetchSubscription(): Promise<void>;
  fetchUsage(): Promise<void>;
  fetchPayments(): Promise<void>;
  createPayment(plan: string, period: 'monthly' | 'yearly'): Promise<{ paymentId: string; confirmationToken: string } | null>;
  pollPaymentStatus(paymentId: string): Promise<boolean>;
  resumePaymentStatusCheck(): Promise<void>;
  resetPaymentState(): void;
}

export type BillingStore = BillingState & BillingActions;

const ACTIVE_PAYMENT_ID_KEY = 'gantt_active_payment_id';

let pollingPromise: Promise<boolean> | null = null;
let pollingPaymentId: string | null = null;

async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<{ response: Response; token: string | null }> {
  let token = useAuthStore.getState().accessToken;
  if (!token) {
    return { response: new Response(null, { status: 401 }), token: null };
  }

  const withToken = (accessToken: string): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let response = await fetch(input, withToken(token));
  if (response.status !== 401) {
    return { response, token };
  }

  token = await useAuthStore.getState().refreshAccessToken();
  if (!token) {
    return { response, token: null };
  }

  response = await fetch(input, withToken(token));
  return { response, token };
}

export const useBillingStore = create<BillingStore>((set, get) => ({
  subscription: null,
  usage: null,
  payments: [],
  loading: false,
  error: null,
  paymentLoading: false,
  paymentStatusChecking: false,
  paymentSuccess: null,
  paymentError: null,
  activePaymentId: typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_PAYMENT_ID_KEY) : null,

  async fetchSubscription() {
    set({ loading: true, error: null });
    try {
      const { response } = await fetchWithAuthRetry('/api/billing/subscription');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as SubscriptionStatus;
      set({
        subscription: data,
        usage: {
          plan: data.plan,
          planMeta: data.planMeta,
          limits: data.limits,
          usage: data.usage,
          remaining: data.remaining,
        },
        loading: false,
      });
    } catch (err) {
      console.error('[useBillingStore] fetchSubscription failed:', err);
      set({ error: String(err), loading: false });
    }
  },

  async fetchUsage() {
    set({ loading: true, error: null });
    try {
      const { response } = await fetchWithAuthRetry('/api/usage');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as UsageStatus;
      set({ usage: data, loading: false });
    } catch (err) {
      console.error('[useBillingStore] fetchUsage failed:', err);
      set({ error: String(err), loading: false });
    }
  },

  async fetchPayments() {
    try {
      const { response } = await fetchWithAuthRetry('/api/billing/payments');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as PaymentRecord[];
      set({ payments: data });
    } catch (err) {
      console.error('[useBillingStore] fetchPayments failed:', err);
    }
  },

  async createPayment(plan, period) {
    set({ paymentLoading: true, paymentStatusChecking: false, paymentError: null, paymentSuccess: null });
    try {
      const { response } = await fetchWithAuthRetry('/api/billing/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, period }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const data = await response.json() as { paymentId: string; confirmationToken: string };
      localStorage.setItem(ACTIVE_PAYMENT_ID_KEY, data.paymentId);
      set({ paymentLoading: false, activePaymentId: data.paymentId, paymentStatusChecking: true });
      return data;
    } catch (err) {
      console.error('[useBillingStore] createPayment failed:', err);
      set({ paymentError: String(err), paymentLoading: false, paymentStatusChecking: false, activePaymentId: null });
      return null;
    }
  },

  async pollPaymentStatus(paymentId) {
    if (pollingPromise && pollingPaymentId === paymentId) {
      return pollingPromise;
    }

    pollingPaymentId = paymentId;
    pollingPromise = (async () => {
      set({ paymentStatusChecking: true, activePaymentId: paymentId });
      const maxAttempts = 180; // 6 minutes at 2-second intervals

      for (let i = 0; i < maxAttempts; i++) {
        try {
          const { response } = await fetchWithAuthRetry(`/api/billing/status?paymentId=${paymentId}`);
          if (!response.ok) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          const data = await response.json() as { status: string };
          if (data.status === 'succeeded') {
            localStorage.removeItem(ACTIVE_PAYMENT_ID_KEY);
            await get().fetchSubscription();
            await get().fetchPayments();
            set({
              paymentSuccess: 'payment_succeeded',
              paymentError: null,
              paymentStatusChecking: false,
              activePaymentId: null,
            });
            return true;
          }
          if (data.status === 'canceled') {
            localStorage.removeItem(ACTIVE_PAYMENT_ID_KEY);
            set({
              paymentError: 'Платеж отменён',
              paymentStatusChecking: false,
              activePaymentId: null,
            });
            return false;
          }
        } catch (err) {
          console.error('[useBillingStore] pollPaymentStatus error:', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      set({
        paymentError: 'Проверяем статус платежа дольше обычного. Оставьте страницу открытой, проверка продолжится автоматически.',
        paymentStatusChecking: false,
      });
      return false;
    })();

    try {
      return await pollingPromise;
    } finally {
      pollingPromise = null;
      pollingPaymentId = null;
    }
  },

  async resumePaymentStatusCheck() {
    const activePaymentId = get().activePaymentId ?? localStorage.getItem(ACTIVE_PAYMENT_ID_KEY);
    if (!activePaymentId) {
      return;
    }
    await get().pollPaymentStatus(activePaymentId);
  },

  resetPaymentState() {
    localStorage.removeItem(ACTIVE_PAYMENT_ID_KEY);
    set({
      paymentLoading: false,
      paymentStatusChecking: false,
      paymentSuccess: null,
      paymentError: null,
      activePaymentId: null,
    });
  },
}));
