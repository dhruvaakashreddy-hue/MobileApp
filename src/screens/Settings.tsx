import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { useApp } from '../state/AppContext';
import {
  Button, Card, IconButton, Screen, ScreenHeader, SectionLabel, ToggleRow,
} from '../components/ui';
import { ActiveHoursPicker } from '../components/ActiveHoursPicker';
import {
  ALL_CATEGORIES, CATEGORY_BLURBS, CATEGORY_EMOJI, CATEGORY_LABELS,
} from '../data/personas';
import { formatExpiry, PRICE_LABEL, PRICE_PERIOD } from '../lib/billing';
import { isNative } from '../lib/notifications';
import { NUDGE_INTERVAL_MINUTES } from '../lib/scheduling';
import { formatE164ForDisplay } from '../lib/auth';
import { Avatar } from '../components/Avatar';

export function Settings() {
  const {
    settings, persona, premium, premiumActive, session,
    updateSettings, toggleCategory, restore, buzz, signOut,
  } = useApp();
  const navigate = useNavigate();
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  const onRestore = async () => {
    buzz();
    setRestoreMsg('Checking…');
    const ok = await restore();
    setRestoreMsg(
      ok ? 'Premium restored — all personas unlocked.' : 'No active subscription found on this device.',
    );
  };

  const onShare = async () => {
    buzz();
    const text =
      'I let a drill sergeant live in my phone and now I drink water. Get Nudge.';
    try {
      if (isNative()) {
        await Share.share({ title: 'Nudge', text, dialogTitle: 'Share Nudge' });
      } else if (navigator.share) {
        await navigator.share({ title: 'Nudge', text });
      }
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  const only = settings.categories.length === 1;

  return (
    <Screen>
      <ScreenHeader
        title="Settings"
        left={
          <IconButton label="Back" onClick={() => navigate(-1)} className="mt-1">
            ‹
          </IconButton>
        }
      />

      <SectionLabel>Account</SectionLabel>
      <Card className="mb-6">
        <button
          onClick={() => {
            buzz();
            navigate('/profile/edit');
          }}
          className="tap flex w-full items-center gap-3 rounded-2xl text-left transition active:bg-white/5"
        >
          <Avatar
            photo={session?.user.photoUrl ?? null}
            name={session?.user.displayName ?? null}
            size={52}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-bold">
              {session?.user.displayName ?? 'Guest'}
            </span>
            <span className="block truncate text-[13px] text-white/45">
              {session?.user.phoneNumber
                ? formatE164ForDisplay(session.user.phoneNumber)
                : session?.user.email ??
                  'No account — everything stays on this phone'}
            </span>
            {session?.user.email && session.user.phoneNumber && (
              <span className="block truncate text-[13px] text-white/35">
                {session.user.email}
              </span>
            )}
          </span>
          <span className="text-white/30" aria-hidden>›</span>
        </button>
        <button
          onClick={() => {
            buzz();
            navigate('/profile/edit');
          }}
          className="tap mt-2 w-full rounded-2xl border border-white/10 px-4 text-sm font-semibold text-white/70 transition active:bg-white/5"
        >
          {session?.user.displayName ? 'Edit profile' : 'Set up your profile'}
        </button>
        <button
          onClick={() => {
            buzz();
            void signOut();
          }}
          className="tap mt-3 w-full rounded-2xl border border-white/10 px-4 text-sm font-semibold text-white/60 transition active:bg-white/5"
        >
          {session?.user.method === 'guest' ? 'Sign in to an account' : 'Sign out'}
        </button>
      </Card>

      <SectionLabel>How often</SectionLabel>
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>⏱️</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">
              Every {NUDGE_INTERVAL_MINUTES} minutes
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-white/45">
              A steady drumbeat while you're inside your active hours.
            </p>
          </div>
        </div>
      </Card>

      <SectionLabel>Active hours</SectionLabel>
      <Card className="mb-6">
        <ActiveHoursPicker
          activeStart={settings.activeStart}
          activeEnd={settings.activeEnd}
          onChange={(next) => void updateSettings(next)}
        />
      </Card>

      <SectionLabel>What you'll get nudged about</SectionLabel>
      <Card className="mb-6">
        {ALL_CATEGORIES.map((c) => {
          const checked = settings.categories.includes(c);
          return (
            <ToggleRow
              key={c}
              emoji={CATEGORY_EMOJI[c]}
              label={CATEGORY_LABELS[c]}
              description={CATEGORY_BLURBS[c]}
              checked={checked}
              // Block turning off the last one — zero categories means no nudges at all.
              disabled={checked && only}
              accentHex={persona.theme.hex}
              onChange={() => {
                buzz();
                void toggleCategory(c);
              }}
            />
          );
        })}
        {only && (
          <p className="mt-2 px-1 text-[13px] text-white/40">
            Keep at least one switched on, otherwise there's nothing to send.
          </p>
        )}
      </Card>

      <SectionLabel>Alerts</SectionLabel>
      <Card className="mb-6">
        <ToggleRow
          emoji="🔊"
          label="Notification sound"
          description="Each persona has its own sound. Off keeps it to a silent banner."
          checked={settings.soundEnabled}
          accentHex={persona.theme.hex}
          onChange={(v) => {
            buzz();
            void updateSettings({ soundEnabled: v });
          }}
        />
        <ToggleRow
          emoji="📳"
          label="Haptics"
          description="A little buzz when you tap things and when a nudge lands."
          checked={settings.hapticsEnabled}
          accentHex={persona.theme.hex}
          onChange={(v) => void updateSettings({ hapticsEnabled: v })}
        />
      </Card>

      <SectionLabel>Subscription</SectionLabel>
      <Card className="mb-6">
        {premiumActive ? (
          <div>
            <p className="font-display text-xl">✨ Premium active</p>
            <p className="mt-1 text-[13px] text-white/50">
              All personas unlocked
              {formatExpiry(premium) ? ` · renews ${formatExpiry(premium)}` : ''}.
            </p>
          </div>
        ) : (
          <div>
            <p className="font-display text-xl">Unlock all personas</p>
            <p className="mt-1 mb-4 text-[13px] text-white/50">
              {PRICE_LABEL}/{PRICE_PERIOD} — every persona, every category.
            </p>
            <Button
              full
              accent={persona.theme.accent}
              onAccent={persona.theme.onAccent}
              onClick={() => navigate('/paywall')}
            >
              See what's inside
            </Button>
          </div>
        )}
        <button
          onClick={onRestore}
          className="tap mt-2 w-full rounded-2xl px-4 text-sm font-semibold text-white/60 transition active:bg-white/5"
        >
          Restore purchases
        </button>
        {restoreMsg && (
          <p className="mt-1 text-center text-[13px] text-white/50" role="status">
            {restoreMsg}
          </p>
        )}
      </Card>

      <SectionLabel>Spread the chaos</SectionLabel>
      <Card className="mb-6">
        <button
          onClick={onShare}
          className="tap flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition active:bg-white/5"
        >
          <span className="text-xl" aria-hidden>📤</span>
          <span className="flex-1 text-[15px] font-semibold">Share Nudge with a friend</span>
          <span className="text-white/30" aria-hidden>›</span>
        </button>
        <button
          onClick={() => {
            buzz();
            // TODO: swap in the real store listing URLs once the app is published.
            // Android: market://details?id=com.nudge.app
            // iOS: itms-apps://itunes.apple.com/app/id<APP_ID>?action=write-review
            window.open('https://example.com/nudge', '_blank');
          }}
          className="tap flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition active:bg-white/5"
        >
          <span className="text-xl" aria-hidden>⭐</span>
          <span className="flex-1 text-[15px] font-semibold">Rate the app</span>
          <span className="text-white/30" aria-hidden>›</span>
        </button>
      </Card>

      <button
        onClick={() => {
          buzz();
          void updateSettings({ onboarded: false });
          navigate('/onboarding');
        }}
        className="tap mb-8 w-full rounded-2xl px-4 text-sm font-semibold text-white/35 transition active:bg-white/5"
      >
        Replay the intro
      </button>
    </Screen>
  );
}
