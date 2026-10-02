import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Entitlements } from '@crush/types';
import { useAuth } from '../providers/AuthProvider';

export function useEntitlements() {
  const { user } = useAuth();

  const entitlementsQuery = useQuery({
    queryKey: ['entitlements', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase.rpc('get_user_entitlements');

      if (error) throw error;
      return data as Entitlements;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const isPremium =
    entitlementsQuery.data &&
    (entitlementsQuery.data.premium_active || entitlementsQuery.data.trial_active);

  const trialDaysRemaining = entitlementsQuery.data?.trial_ends_at
    ? Math.ceil(
        (new Date(entitlementsQuery.data.trial_ends_at).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  return {
    entitlements: entitlementsQuery.data,
    isPremium: !!isPremium,
    isTrialActive: !!entitlementsQuery.data?.trial_active,
    trialDaysRemaining: Math.max(0, trialDaysRemaining),
    isLoading: entitlementsQuery.isLoading,
    error: entitlementsQuery.error,
    refetch: entitlementsQuery.refetch,
  };
}
