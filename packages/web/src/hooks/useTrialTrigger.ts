import { useState, useCallback, useEffect } from 'react';
import { useBillingStore, isTrialActive, type SubscriptionStatus } from '../stores/useBillingStore';
import { useAuthStore } from '../stores/useAuthStore';

const TRIAL_DECLINED_KEY = 'gantt_trial_declined';

interface TrialTriggerState {
  shouldShowOffer: boolean;
  triggerFeature: string | null;
  loading: boolean;
  activateTrial: () => Promise<boolean>;
  dismissOffer: () => void;
  checkEligibility: () => Promise<void>;
}

export function useTrialTrigger(): TrialTriggerState {
  const [shouldShowOffer, setShouldShowOffer] = useState(false);
  const [triggerFeature, setTriggerFeature] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const subscription = useBillingStore((s) => s.subscription);
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  const accessToken = useAuthStore((s) => s.accessToken);
  const constraintDenial = useAuthStore((s) => s.constraintDenial);

  const checkEligibility = useCallback(async () => {
    if (!accessToken || isTrialActive(subscription)) return;

    // Don't re-offer in same session if declined
    if (sessionStorage.getItem(TRIAL_DECLINED_KEY)) return;

    try {
      const response = await fetch('/api/billing/trial/eligibility', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return;

      const data = await response.json() as {
        eligible: boolean;
        shouldOffer: boolean;
        triggerType: string | null;
      };

      if (data.eligible && data.shouldOffer) {
        setShouldShowOffer(true);
      }
    } catch {
      // Silently ignore eligibility check failures
    }
  }, [accessToken, subscription]);

  // Auto-check when constraint denial occurs (premium feature attempt trigger)
  useEffect(() => {
    if (constraintDenial?.code && accessToken && !isTrialActive(subscription)) {
      const featureName = constraintDenial.limitKey ?? constraintDenial.code;
      setTriggerFeature(featureName ?? null);
      void checkEligibility();
    }
  }, [constraintDenial, accessToken, subscription, checkEligibility]);

  const activateTrial = useCallback(async (): Promise<boolean> => {
    if (!accessToken) return false;
    setLoading(true);

    try {
      const response = await fetch('/api/billing/trial/start', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ triggerType: 'premium_feature_attempt' }),
      });

      if (!response.ok) return false;

      await fetchSubscription();
      setShouldShowOffer(false);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [accessToken, fetchSubscription]);

  const dismissOffer = useCallback(() => {
    setShouldShowOffer(false);
    setTriggerFeature(null);
    sessionStorage.setItem(TRIAL_DECLINED_KEY, '1');
    useAuthStore.setState({ constraintDenial: null });
  }, []);

  return {
    shouldShowOffer,
    triggerFeature,
    loading,
    activateTrial,
    dismissOffer,
    checkEligibility,
  };
}
