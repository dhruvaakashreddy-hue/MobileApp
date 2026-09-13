import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nudge.app',
  appName: 'Nudge',
  webDir: 'dist',
  // Deep link scheme used by the Razorpay payment-success return trip.
  // Must match the intent-filter / URL type registered on each platform.
  // See docs/MANUAL_SETUP.md for the native registration steps.
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_nudge',
      iconColor: '#7C3AED',
      // Custom per-persona sounds are passed per-notification at schedule time.
      // These files live in android/app/src/main/res/raw and the iOS app bundle.
      sound: 'nudge_default.wav',
    },
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#0B0B12',
      showSpinner: false,
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
