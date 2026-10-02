import { create } from 'zustand';
import { Profile, Entitlements, SubscriptionPlan } from '@crush/types';

interface AppStoreState {
  // User Profile
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;

  // Entitlements
  entitlements: Entitlements | null;
  setEntitlements: (entitlements: Entitlements | null) => void;

  // UI State
  safetyPopupShown: boolean;
  setSafetyPopupShown: (shown: boolean) => void;

  // Discovery
  currentDiscoveryIndex: number;
  setCurrentDiscoveryIndex: (index: number) => void;

  // Subscription
  planType: SubscriptionPlan;
  setPlanType: (plan: SubscriptionPlan) => void;

  // Incognito Mode
  incognitoEnabled: boolean;
  setIncognitoEnabled: (enabled: boolean) => void;

  // Reset state
  reset: () => void;
}

const initialState = {
  profile: null,
  entitlements: null,
  safetyPopupShown: false,
  currentDiscoveryIndex: 0,
  planType: 'free' as SubscriptionPlan,
  incognitoEnabled: false,
};

export const useAppStore = create<AppStoreState>((set) => ({
  ...initialState,

  setProfile: (profile) => set({ profile }),
  setEntitlements: (entitlements) => set({ entitlements }),
  setSafetyPopupShown: (shown) => set({ safetyPopupShown: shown }),
  setCurrentDiscoveryIndex: (index) => set({ currentDiscoveryIndex: index }),
  setPlanType: (plan) => set({ planType: plan }),
  setIncognitoEnabled: (enabled) => set({ incognitoEnabled: enabled }),

  reset: () => set(initialState),
}));
