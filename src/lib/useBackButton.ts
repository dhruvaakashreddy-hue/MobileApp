import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { useLocation, useNavigate } from 'react-router-dom';
import { isNative } from './notifications';

/**
 * Android's hardware back button: go back through the app's own history first,
 * and only let it close the app from the home screen. Without this, back exits
 * the app from any screen, which feels broken to Android users.
 */
export function useBackButton(onIntercept?: () => boolean) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isNative()) return;
    let handle: { remove: () => Promise<void> } | null = null;

    void CapApp.addListener('backButton', ({ canGoBack }) => {
      // A modal (the nudge card) gets first refusal on the back press.
      if (onIntercept?.()) return;

      if (location.pathname !== '/' && canGoBack) {
        navigate(-1);
      } else if (location.pathname !== '/') {
        navigate('/', { replace: true });
      } else {
        void CapApp.exitApp();
      }
    }).then((h) => {
      handle = h;
    });

    return () => {
      void handle?.remove();
    };
  }, [navigate, location.pathname, onIntercept]);
}
