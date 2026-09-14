import { useEffect } from 'react';
import {
  HashRouter, Navigate, Route, Routes, useLocation,
} from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { AppProvider, useApp } from './state/AppContext';
import { NudgeOverlay } from './components/NudgeOverlay';
import { Home } from './screens/Home';
import { Personas } from './screens/Personas';
import { Settings } from './screens/Settings';
import { Paywall } from './screens/Paywall';
import { Onboarding } from './screens/Onboarding';
import { Login } from './screens/Login';
import { ProfileSetup } from './screens/ProfileSetup';
import { isNative } from './lib/notifications';
import { useBackButton } from './lib/useBackButton';

function Routed() {
  const { ready, session, profileComplete, premiumActive, settings, activeNudge } =
    useApp();
  const location = useLocation();

  // While a nudge card is up, back is swallowed: answering it is mandatory, so
  // the gesture must neither close the card nor navigate away behind it.
  useBackButton(() => !!activeNudge);

  useEffect(() => {
    if (!ready || !isNative()) return;
    void SplashScreen.hide().catch(() => {});
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  }, [ready]);

  if (!ready) {
    // Brief, quiet loading state — Preferences reads are near-instant.
    return (
      <div className="grid h-full place-items-center">
        <motion.span
          className="text-5xl"
          aria-label="Loading"
          animate={{ rotate: [-10, 10, -10] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          👋
        </motion.span>
      </div>
    );
  }

  // The gate runs in order: sign in, set up a profile, subscribe, then
  // onboarding. Each step is skipped once it is done.
  if (!session && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  const needsProfile = !!session && !profileComplete;
  if (needsProfile && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace />;
  }

  // Nudge is a paid app: no subscription, no nudges. The paywall is a gate
  // rather than an upsell, so it cannot be dismissed past — only paid,
  // restored, or signed out of.
  const needsSubscription = !!session && !needsProfile && !premiumActive;
  if (needsSubscription && location.pathname !== '/paywall') {
    return <Navigate to="/paywall" replace />;
  }

  if (
    session &&
    !needsProfile &&
    !needsSubscription &&
    !settings.onboarded &&
    location.pathname !== '/onboarding'
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  // Nothing to do on the login or paywall screens once they are satisfied.
  if (session && location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }
  if (session && !needsSubscription && location.pathname === '/paywall') {
    return <Navigate to="/" replace />;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<ProfileSetup />} />
          <Route path="/profile/edit" element={<ProfileSetup mode="edit" />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/personas" element={<Personas />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/paywall" element={<Paywall />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routed />
        <NudgeOverlay />
      </HashRouter>
    </AppProvider>
  );
}
