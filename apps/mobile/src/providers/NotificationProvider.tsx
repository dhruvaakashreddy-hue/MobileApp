import React, { createContext, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

interface NotificationContextType {
  pushToken: string | null;
  isNotificationEnabled: boolean;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    registerForPushNotifications();
  }, [user]);

  const registerForPushNotifications = async () => {
    try {
      // Check if device supports push notifications
      if (!Device.isDevice) {
        console.log('Push notifications only work on physical devices');
        return;
      }

      // Get notification permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push notification permission');
        setIsNotificationEnabled(false);
        return;
      }

      setIsNotificationEnabled(true);

      // Get expo push token
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.error('Missing Expo project ID');
        return;
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      setPushToken(token.data);

      // Store push token in database
      if (user && token.data) {
        await storePushToken(user.id, token.data);
      }
    } catch (error) {
      console.error('Push notification registration error:', error);
      setIsNotificationEnabled(false);
    }
  };

  const storePushToken = async (userId: string, token: string) => {
    try {
      const platformType = Device.osVersion ? 'ios' : 'android';

      await supabase.from('push_tokens').insert({
        user_id: userId,
        token,
        platform: platformType,
      });
    } catch (error) {
      console.error('Error storing push token:', error);
    }
  };

  const value: NotificationContextType = {
    pushToken,
    isNotificationEnabled,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
