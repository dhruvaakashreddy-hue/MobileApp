import React, { createContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isOver18: boolean;
  signInWithPhone: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, otp: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOver18, setIsOver18] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  // Check authentication state on app launch
  useEffect(() => {
    const initAuth = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        // Check if user's profile exists and age is verified
        if (currentSession?.user) {
          await checkAgeVerification(currentSession.user.id);
        }
      } catch (error) {
        console.error('Auth init error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        await checkAgeVerification(currentSession.user.id);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const checkAgeVerification = useCallback(async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('dob')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Profile fetch error:', error);
        setIsOver18(false);
        return;
      }

      if (profile?.dob) {
        const dob = new Date(profile.dob);
        const age = new Date().getFullYear() - dob.getFullYear();
        const monthDiff = new Date().getMonth() - dob.getMonth();

        const isOver18 = age > 18 || (age === 18 && monthDiff >= 0);
        setIsOver18(isOver18);

        if (!isOver18) {
          // Block under-18 users
          await signOut();
        }
      }
    } catch (error) {
      console.error('Age verification error:', error);
      setIsOver18(false);
    }
  }, []);

  const signInWithPhone = useCallback(async (phone: string) => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+91${phone.replace(/[^\d]/g, '')}`,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string) => {
    try {
      setIsLoading(true);
      const { error, data } = await supabase.auth.verifyOtp({
        phone: `+91${phone.replace(/[^\d]/g, '')}`,
        token: otp,
        type: 'sms',
      });

      if (error) {
        throw error;
      }

      setSession(data.session);
      setUser(data.user);

      // Initialize user trial if first login
      if (data.user) {
        await initializeUserTrial(data.user.id);
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const initializeUserTrial = async (userId: string) => {
    try {
      // Initialize CRUSH+ 7-day trial for first login
      await supabase.rpc('initialize_user_trial');
    } catch (error) {
      console.error('Trial initialization error:', error);
      // Don't fail if trial init fails
    }
  };

  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      setSession(null);
      setIsOver18(false);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    isOver18,
    signInWithPhone,
    verifyOtp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
