/**
 * Billing store — subscription status, payments, and payment flow
 *
 * Uses fetchWithAuthRetry pattern from useAuthStore for authenticated requests.
 */

import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';

export interface PlanLimits {
  projects: number;
  aiGenerations: number;
  aiRefinements: number;
  resources: number;
  teamMembers: number;
}

export interface SubscriptionStatus {
  plan: string;
  periodEnd: string | null;
  aiUsed: number;
  aiLimit: number;
  isActive: boolean;
  limits: PlanLimits;
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
  payments: PaymentRecord[];
  loading: boolean;
  error: string | null;
  // Payment flow state
  paymentLoading: boolean;
  paymentSuccess: string | null;
  paymentError: string | null;
}

export interface BillingActions {
  fetchSubscription(): Promise<void>;
  fetchPayments(): Promise<void>;
  createPayment(plan: string, period: 'monthly' | 'yearly'): Promise<{ paymentId: string; confirmationToken: string } | null>;
  pollPaymentStatus(paymentId: string): Promise<boolean>;
  resetPaymentState(): void;
}

export type BillingStore = BillingState & BillingActions;

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
  payments: [],
  loading: false,
  error: null,
  paymentLoading: false,
  paymentSuccess: null,
  paymentError: null,

  async fetchSubscription() {
    set({ loading: true, error: null });
    try {
      const { response } = await fetchWithAuthRetry('/api/billing/subscription');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json() as SubscriptionStatus;
      set({ subscription: data, loading: false });
    } catch (err) {
      console.error('[useBillingStore] fetchSubscription failed:', err);
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
    set({ paymentLoading: true, paymentError: null, paymentSuccess: null });
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
      set({ paymentLoading: false });
      return data;
    } catch (err) {
      console.error('[useBillingStore] createPayment failed:', err);
      set({ paymentError: String(err), paymentLoading: false });
      return null;
    }
  },

  async pollPaymentStatus(paymentId) {
    const maxAttempts = 60; // 120 seconds at 2-second intervals
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const { response } = await fetchWithAuthRetry(`/api/billing/status?paymentId=${paymentId}`);
        if (!response.ok) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        const data = await response.json() as { status: string };
        if (data.status === 'succeeded') {
          // Refresh subscription and payments after successful payment
          await get().fetchSubscription();
          await get().fetchPayments();
          set({ paymentSuccess: 'payment_succeeded' });
          return true;
        }
        if (data.status === 'canceled') {
          set({ paymentError: 'Платеж отменён' });
          return false;
        }
      } catch (err) {
        console.error('[useBillingStore] pollPaymentStatus error:', err);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    set({ paymentError: 'Таймаут ожидания платежа. Обновите страницу.' });
    return false;
  },

  resetPaymentState() {
    set({ paymentLoading: false, paymentSuccess: null, paymentError: null });
  },
}));
